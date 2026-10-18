"""Read-only GLB structure audit; resolution and polygon count do not prove realism."""
import hashlib
import json
import struct
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ASSETS = {
    "current": ROOT / "frontend/public/models/avatar/dopamine-v1/female.glb",
    "body150": ROOT / "verification/dopamine-avatar/originals/dada-dopamine-body-150k-8k.glb",
    "body2m": ROOT / "verification/dopamine-avatar/originals/dada-dopamine-body-source-8k.glb",
    "candidate": ROOT / "verification/avatar-realism/originals/dada-realism-source-8k.glb",
}


def audit(path: Path):
    data = path.read_bytes()
    magic, version, size = struct.unpack_from("<4sII", data)
    if magic != b"glTF" or version != 2 or size != len(data):
        raise ValueError(f"Invalid or incomplete GLB: {path.name}")
    length, kind = struct.unpack_from("<II", data, 12)
    if kind != 0x4E4F534A:
        raise ValueError("GLB first chunk is not JSON")
    doc = json.loads(data[20:20 + length])
    triangles = 0
    for mesh in doc.get("meshes", []):
        for primitive in mesh.get("primitives", []):
            if primitive.get("mode", 4) == 4:
                accessor = primitive.get("indices", primitive["attributes"]["POSITION"])
                triangles += doc["accessors"][accessor]["count"] // 3
    materials = doc.get("materials", [])
    return {
        "path": str(path.relative_to(ROOT)),
        "bytes": len(data),
        "sha256": hashlib.sha256(data).hexdigest(),
        "triangles": triangles,
        "materials": len(materials),
        "skins": len(doc.get("skins", [])),
        "animations": len(doc.get("animations", [])),
        "material_names": [m.get("name", "") for m in materials],
        "embedded_images": sum("bufferView" in i for i in doc.get("images", [])),
        "external_resources": [i["uri"] for i in doc.get("images", []) + doc.get("buffers", []) if "uri" in i],
    }


result = {name: audit(path) if path.exists() else {"available": False} for name, path in ASSETS.items()}
output = Path(__file__).with_name("asset-audit.json")
output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(json.dumps({key: {k: v for k, v in value.items() if k in {"triangles", "materials", "available", "bytes"}} for key, value in result.items()}))
