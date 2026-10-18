"""Finalize provenance and thumbnails from actual same-source browser renders."""
from pathlib import Path
import json
from PIL import Image, ImageOps, ImageDraw

HERE = Path(__file__).resolve().parent
PUBLIC = HERE.parents[1] / "frontend/public/models/avatar/beauty-v2"
manifest = json.loads((HERE / "generation-manifest.json").read_text())
path = PUBLIC / "PROVENANCE.json"
doc = json.loads(path.read_text())
doc["material_finish"] = "Non-metallic surface; generated roughness green channel clamped to at least 174/255, metallic factor 0. Base-color not repainted."
doc["selected_tasks"] = {
    record["model"]: record["task"] for record in manifest["records"]
    if manifest["selection"][record["model"]] == record["candidate"]
}
path.write_text(json.dumps(doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
(PUBLIC / "generation-manifest.json").write_text(json.dumps({
    "generated": manifest["generated"], "selected_tasks": doc["selected_tasks"],
    "inputs": "Original fictional adult AI-authored references",
    "settings": "Tripo H3.1 ultra geometry; 8K/PBR/delight; single-image 3D enhancement",
    "presentation": "fixed-pose complete outfits", "material_finish": doc["material_finish"],
    "limits": manifest["visual_review"]["limits"],
}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

sheet = Image.new("RGB", (900, 840), "#faf7f4")
draw = ImageDraw.Draw(sheet)
for row, sex in enumerate(("female", "male")):
    with Image.open(HERE / f"{sex}-refined-full-front.png") as render:
        ImageOps.fit(render.convert("RGB"), (160, 220), method=Image.Resampling.LANCZOS).save(PUBLIC / f"{sex}.webp", quality=94)
    for column, angle in enumerate(("front", "side", "back")):
        with Image.open(HERE / f"{sex}-refined-full-{angle}.png") as render:
            image = ImageOps.contain(render.convert("RGB"), (298, 390), Image.Resampling.LANCZOS)
            sheet.paste(image, (column * 300 + (300 - image.width) // 2, row * 420))
        draw.text((column * 300 + 12, row * 420 + 400), f"{sex} / {angle} / actual 3D render", fill="#333333")
sheet.save(HERE / "refined-models-contact.jpg", quality=95)

faces = Image.new("RGB", (1200, 430), "#faf7f4")
draw = ImageDraw.Draw(faces)
for column, (sex, look, label) in enumerate((
    ("female", "original", "Female / previous"), ("female", "refined", "Female / refined"),
    ("male", "original", "Male / previous"), ("male", "refined", "Male / refined"),
)):
    with Image.open(HERE / f"{sex}-{look}-portrait-front.png") as render:
        # Identical normalized scene framing; no retouching or AI-generated substitution.
        crop = render.crop((0, int(render.height * .08), render.width, int(render.height * .78)))
        faces.paste(ImageOps.fit(crop.convert("RGB"), (298, 395), method=Image.Resampling.LANCZOS), (column * 300, 0))
    draw.text((column * 300 + 12, 409), label, fill="#333333")
faces.save(HERE / "face-comparison.jpg", quality=95)
