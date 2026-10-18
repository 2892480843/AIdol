"""Pure image/segmentation checks; runnable without DB via unittest discovery."""

import base64
import importlib.util
import io
import subprocess
import sys
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

import numpy as np
from PIL import Image

spec = importlib.util.spec_from_file_location(
    "clothing_extraction_service",
    Path(__file__).resolve().parents[1] / "app/services/clothing_extraction.py",
)
service = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = service
spec.loader.exec_module(service)
ExtractionInputError = service.ExtractionInputError
decode_image = service.decode_image
pieces_from_logits = service.pieces_from_logits
prepare_input = service.prepare_input


class ClothingExtractionTests(unittest.TestCase):
    def test_masks_exclude_body_and_merge_both_shoes(self):
        image = Image.new("RGB", (64, 64), "#d59266")
        logits = np.full((18, 64, 64), -8.0, dtype=np.float32)
        logits[0] = 8
        for label, box in [
            (4, (20, 10, 44, 28)),
            (5, (20, 30, 44, 42)),
            (9, (20, 52, 27, 58)),
            (10, (37, 52, 44, 58)),
            (11, (25, 2, 38, 8)),
            (14, (10, 15, 16, 30)),
        ]:
            x0, y0, x1, y1 = box
            logits[0, y0:y1, x0:x1] = -8
            logits[label, y0:y1, x0:x1] = 8
        pieces = pieces_from_logits(image, logits, (0, 0, 64, 64))
        self.assertEqual([x["type"] for x in pieces], ["top", "skirt", "shoes"])
        shoes = pieces[-1]
        self.assertEqual(
            shoes["bbox"], {"x": 20 / 64, "y": 52 / 64, "width": 24 / 64, "height": 6 / 64}
        )
        png = Image.open(io.BytesIO(base64.b64decode(shoes["thumbnail_data_url"].split(",")[1])))
        self.assertEqual(png.mode, "RGBA")
        self.assertEqual(png.getpixel((11, 2))[3], 0)
        self.assertGreater(pieces[0]["confidence"], 0.99)

    def test_empty_and_tiny_labels_do_not_fabricate_pieces(self):
        logits = np.zeros((18, 64, 64), np.float32)
        logits[0] = 8
        logits[7, 0, 0] = 10
        self.assertEqual(pieces_from_logits(Image.new("RGB", (64, 64)), logits, (0, 0, 64, 64)), [])

    def test_preprocessing_preserves_aspect_and_uses_bgr(self):
        tensor, box = prepare_input(Image.new("RGB", (20, 40), (255, 0, 0)))
        self.assertEqual(tensor.shape, (1, 3, 512, 512))
        self.assertEqual(box, (128, 0, 384, 512))
        self.assertAlmostEqual(float(tensor[0, 0, 256, 256]), -0.406 / 0.225, places=4)
        self.assertAlmostEqual(float(tensor[0, 2, 256, 256]), (1 - 0.485) / 0.229, places=4)

    def test_decode_rejects_invalid_or_oversized_image(self):
        with self.assertRaises(ExtractionInputError):
            decode_image(b"not an image")
        data = io.BytesIO()
        Image.new("RGB", (4097, 1)).save(data, format="PNG")
        with self.assertRaises(ExtractionInputError):
            decode_image(data.getvalue())

    def test_timeout_kills_worker_and_releases_capacity(self):
        data = io.BytesIO()
        Image.new("RGB", (40, 40)).save(data, format="PNG")
        worker = MagicMock()
        worker.communicate.side_effect = [subprocess.TimeoutExpired("worker", 1), (b"", b"")]
        process = MagicMock()
        process.__enter__.return_value = worker
        with (
            patch.object(service, "capabilities", return_value={"available": True}),
            patch.object(service.subprocess, "Popen", return_value=process),
        ):
            with self.assertRaises(service.ExtractionTimeout):
                service.extract_clothing(data.getvalue())
        worker.kill.assert_called_once()
        self.assertTrue(service._GATE.acquire(blocking=False))
        service._GATE.release()

    def test_capabilities_no_model_and_does_not_expose_paths(self):
        with patch.dict(
            service.os.environ,
            {"CLOTHING_EXTRACTION_MODEL_PATH": "/missing/not-private/model.onnx"},
        ):
            result = service.capabilities()
        self.assertFalse(result["available"])
        self.assertEqual(set(result), {"available", "model", "max_bytes", "max_pixels"})

    def test_decode_applies_orientation_and_strips_metadata(self):
        data = io.BytesIO()
        image = Image.new("RGB", (40, 20))
        exif = Image.Exif()
        exif[274] = 6
        image.save(data, format="JPEG", exif=exif)
        result = decode_image(data.getvalue())
        self.assertEqual(result.size, (20, 40))
        self.assertFalse(result.getexif())


if __name__ == "__main__":
    unittest.main()
