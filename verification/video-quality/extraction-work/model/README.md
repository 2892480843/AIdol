---
language: en
license: mit
tags:
  - vision
  - image-segmentation
  - semantic-segmentation
  - human-parsing
  - fashion
  - clothing
  - pytorch
  - onnx
datasets:
  - atr
pipeline_tag: image-segmentation
---

# SCHP — Self-Correction Human Parsing (ATR, 18 classes)

**SCHP** (Self-Correction for Human Parsing) is a state-of-the-art human parsing model based on a ResNet-101 backbone.
This checkpoint is trained on the **ATR** dataset and packaged for the 🤗 Transformers `AutoModel` API.

> Original repository: [PeikeLi/Self-Correction-Human-Parsing](https://github.com/PeikeLi/Self-Correction-Human-Parsing)

| Source image | Segmentation result |
|:---:|:---:|
| ![demo](./assets/demo.jpg) | ![demo-atr](./assets/demo_atr.png) |

**Use cases:**
- 🎨 **Outfit palette extraction** — mask each clothing region (shirt, pants, dress…) then run color clustering to extract the dominant colors per garment
- 🏷️ **Product tagging for e-commerce** — automatically label uploaded photos with clothing categories before indexing in a catalog
- 👚 **Virtual try-on pre-processing** — generate clean garment masks (upper-clothes, skirt, dress…) as segmentation input to try-on models such as VITON or LaDI-VTON
- ✏️ **Dataset annotation** — accelerate labeling pipelines for fashion datasets by using predicted masks as initial annotations to correct manually
- ✂️ **Clothing area cropping** — crop tight bounding boxes around specific items (e.g. only the bag, only the shoes) for downstream classification or retrieval models

## Dataset — ATR

ATR is a large single-person human parsing dataset with 17 000+ images focused on **fashion AI**.

- **mIoU on ATR test: 82.29%**
- 18 labels covering clothing items and body parts

## Labels

| ID | Label | ID | Label | ID | Label |
|----|-------|----|---------|----|-------|
| 0 | Background | 6 | Pants | 12 | Left-leg |
| 1 | Hat | 7 | Dress | 13 | Right-leg |
| 2 | Hair | 8 | Belt | 14 | Left-arm |
| 3 | Sunglasses | 9 | Left-shoe | 15 | Right-arm |
| 4 | Upper-clothes | 10 | Right-shoe | 16 | Bag |
| 5 | Skirt | 11 | Face | 17 | Scarf |

## Usage — PyTorch

```python
from transformers import AutoImageProcessor, AutoModelForSemanticSegmentation
from PIL import Image
import torch

model = AutoModelForSemanticSegmentation.from_pretrained("pirocheto/schp-atr-18", trust_remote_code=True)
processor = AutoImageProcessor.from_pretrained("pirocheto/schp-atr-18", trust_remote_code=True)

image = Image.open("photo.jpg").convert("RGB")
inputs = processor(images=image, return_tensors="pt")

with torch.no_grad():
    outputs = model(**inputs)

# outputs.logits       — (1, 18, 512, 512) raw logits
# outputs.parsing_logits — (1, 18, 512, 512) refined parsing logits
# outputs.edge_logits    — (1,  1, 512, 512) edge prediction logits
seg_map = outputs.logits.argmax(dim=1).squeeze().numpy()  # (H, W), values in [0, 17]
```

Each pixel in `seg_map` is a label ID. To map IDs back to names:

```python
id2label = model.config.id2label
print(id2label[4])  # → "Upper-clothes"
```

## Usage — ONNX Runtime

Optimized ONNX files are available in the `onnx/` folder of this repo:

| File | Size | Notes |
|------|------|-------|
| `onnx/schp-atr-18.onnx` + `.onnx.data` | ~257 MB | FP32, dynamic batch |
| `onnx/schp-atr-18-int8-static.onnx` | ~66 MB | INT8 static, 99.94% pixel agreement |

```python
import onnxruntime as ort
import numpy as np
from huggingface_hub import hf_hub_download
from transformers import AutoImageProcessor
from PIL import Image

model_path = hf_hub_download("pirocheto/schp-atr-18", "onnx/schp-atr-18-int8-static.onnx")
processor  = AutoImageProcessor.from_pretrained("pirocheto/schp-atr-18", trust_remote_code=True)

sess_opts = ort.SessionOptions()
sess_opts.intra_op_num_threads = 8
sess = ort.InferenceSession(model_path, sess_opts, providers=["CPUExecutionProvider"])

image  = Image.open("photo.jpg").convert("RGB")
inputs = processor(images=image, return_tensors="np")
logits = sess.run(["logits"], {"pixel_values": inputs["pixel_values"]})[0]
seg_map = logits.argmax(axis=1).squeeze()  # (H, W)
```

## Performance

Benchmarked on CPU (16-core, 8 ORT threads, `intra_op_num_threads=8`):

| Backend | Latency | Speedup | Size |
|---------|---------|---------|------|
| PyTorch FP32 | ~430 ms | 1× | 256 MB |
| ONNX FP32 | ~293 ms | 1.5× | 257 MB |
| ONNX INT8 static | ~229 ms | **1.9×** | **66 MB** |

INT8 static quantization achieves **99.94% pixel-level agreement** with the FP32 model.

## Model Details

| Property | Value |
|----------|-------|
| Architecture | ResNet-101 + SCHP self-correction |
| Input size | 512 × 512 |
| Output | 3 heads: logits, parsing_logits, edge_logits |
| Training dataset | ATR |
| Number of classes | 18 |
| Framework | PyTorch / Transformers |

## Citation

```bibtex
@article{li2020self,
  title={Self-Correction for Human Parsing},
  author={Li, Peike and Xu, Yunqiu and Wei, Yunchao and Yang, Yi},
  journal={IEEE Transactions on Pattern Analysis and Machine Intelligence},
  year={2020},
  doi={10.1109/TPAMI.2020.3048039}
}
```
