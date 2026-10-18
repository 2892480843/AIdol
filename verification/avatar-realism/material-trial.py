"""Split fixed-pose surface material assignments without editing any texture or vertex.

This is a bounded visual experiment, not a facial/hair reconstruction. Never writes
production assets. Source color samples and height constraints identify regions;
the real rendered boundary must be inspected before adopting the result.
"""
import copy
import hashlib
import io
import json
import struct
from pathlib import Path

import numpy as np
from PIL import Image

HERE = Path(__file__).resolve().parent
SOURCE = HERE.parents[1] / "frontend/public/models/avatar/dopamine-v1/female.glb"
raw = SOURCE.read_bytes()
length = struct.unpack_from("<I", raw, 12)[0]
original = json.loads(raw[20:20 + length])
binary = raw[28 + length:]


def array(index):
    a = original["accessors"][index]
    v = original["bufferViews"][a["bufferView"]]
    dtype = {5126: "<f4", 5125: "<u4", 5123: "<u2"}[a["componentType"]]
    width = {"SCALAR": 1, "VEC2": 2, "VEC3": 3}[a["type"]]
    return np.frombuffer(binary, dtype=dtype, count=a["count"] * width,
                         offset=v.get("byteOffset", 0) + a.get("byteOffset", 0)).reshape(-1, width)


p = original["meshes"][0]["primitives"][0]
positions = array(p["attributes"]["POSITION"])
uv = array(p["attributes"]["TEXCOORD_0"])
triangles = array(p["indices"]).reshape(-1, 3)
image = original["images"][0]
v = original["bufferViews"][image["bufferView"]]
with Image.open(io.BytesIO(binary[v["byteOffset"]:v["byteOffset"] + v["byteLength"]])) as im:
    pixels = np.asarray(im.convert("RGB"))
    width, height = im.size
    uv_points = uv[triangles].mean(axis=1)
    # glTF UV (0,0) addresses the upper-left of an embedded image.
    x = np.clip(np.rint(uv_points[:, 0] * (width - 1)), 0, width - 1).astype(int)
    y = np.clip(np.rint(uv_points[:, 1] * (height - 1)), 0, height - 1).astype(int)
    rgb = pixels[y, x].astype(float) / 255

centers = positions[triangles].mean(axis=1)
relative_height = centers[:, 1] / positions[:, 1].max()
r, g, b = rgb.T
labels = np.zeros(len(triangles), dtype=np.int32)
labels[(relative_height > .63) & (r < .48) & (g < .36) & (b < .34)] = 2  # hair
labels[(r > .38) & (r > g * 1.05) & (g > b * 1.035) & (g > r * .63) & (relative_height > .15)] = 1  # skin
labels[(relative_height > .51) & (relative_height < .82) & (r > g * 1.25) & (b > g * 1.08)] = 3  # knit
labels[(relative_height > .34) & (relative_height < .62) & (g > r * 1.1) & (b > r * 1.1)] = 4  # skirt
labels[relative_height < .15] = 5

settings = [
    ("authored", 1.0, 1.0),
    ("skin", .72, .45),
    ("hair", .84, .55),
    ("knit", 1.0, .75),
    ("skirt", 1.0, .75),
    ("footwear", 1.0, 1.0),
]
doc = copy.deepcopy(original)
doc["materials"] = []
doc["meshes"][0]["primitives"] = []
out = bytearray(binary)
counts = {}
ordered = []
for label, (name, roughness, normal_scale) in enumerate(settings):
    subset = triangles[labels == label].astype("<u4")
    counts[name] = len(subset)
    if not len(subset):
        continue
    ordered.extend(subset.tolist())
    material = copy.deepcopy(original["materials"][0])
    material["name"] = "dada_trial_" + name
    material["pbrMetallicRoughness"]["roughnessFactor"] = roughness
    material["normalTexture"]["scale"] = normal_scale
    material.setdefault("extras", {})["avatarSurface"] = name
    material_index = len(doc["materials"])
    doc["materials"].append(material)
    out.extend(b"\0" * (-len(out) % 4))
    view_index = len(doc["bufferViews"])
    payload = subset.tobytes()
    doc["bufferViews"].append({"buffer": 0, "byteOffset": len(out), "byteLength": len(payload), "target": 34963})
    out.extend(payload)
    index = len(doc["accessors"])
    doc["accessors"].append({"bufferView": view_index, "componentType": 5125, "count": int(subset.size), "type": "SCALAR", "min": [int(subset.min())], "max": [int(subset.max())]})
    primitive = copy.deepcopy(p)
    primitive.update(material=material_index, indices=index)
    doc["meshes"][0]["primitives"].append(primitive)

# Every source triangle survives exactly once, including winding and vertex IDs.
assert sorted(map(tuple, triangles.tolist())) == sorted(map(tuple, ordered))
assert out[:len(binary)] == binary
doc["buffers"][0]["byteLength"] = len(out)
header = json.dumps(doc, separators=(",", ":")).encode()
header += b" " * (-len(header) % 4)
out.extend(b"\0" * (-len(out) % 4))
packed = struct.pack("<III", 0x46546C67, 2, 28 + len(header) + len(out))
packed += struct.pack("<II", len(header), 0x4E4F534A) + header
packed += struct.pack("<II", len(out), 0x004E4942) + out
(HERE / "material-trial.glb").write_bytes(packed)
report = {"source_sha256": hashlib.sha256(raw).hexdigest(), "trial_sha256": hashlib.sha256(packed).hexdigest(),
          "bytes": len(packed), "triangles": len(triangles), "region_triangles": counts,
          "all_source_binary_preserved": True, "all_triangles_preserved": True,
          "texture_editing": False, "status": "experiment_not_released"}
(HERE / "material-trial.json").write_text(json.dumps(report, indent=2) + "\n")
print(json.dumps(report))
