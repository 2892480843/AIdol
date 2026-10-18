"""Package original Tripo GLBs as fixed-pose complete outfits for web display.

Alternative verification for generated assets: GLB lengths, every embedded view,
geometry payload hashes, decoded texture dimensions and absence of broken rigs.
This does not certify aesthetic quality; inspect the actual browser render too.
"""
from pathlib import Path
import copy
import hashlib
import io
import json
import struct
from PIL import Image

HERE = Path(__file__).resolve().parent
PUBLIC = HERE.parents[1] / "frontend/public/models/avatar/dopamine-v1"
PUBLIC.mkdir(parents=True, exist_ok=True)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def read_glb(path):
    raw = path.read_bytes()
    magic, version, total = struct.unpack_from("<III", raw)
    assert magic == 0x46546C67 and version == 2 and total == len(raw)
    length, kind = struct.unpack_from("<II", raw, 12)
    assert kind == 0x4E4F534A
    doc = json.loads(raw[20:20 + length])
    binary_length, binary_kind = struct.unpack_from("<II", raw, 20 + length)
    assert binary_kind == 0x004E4942
    binary = raw[28 + length:]
    assert len(binary) == binary_length
    assert all("uri" not in b for b in doc["buffers"])
    assert all("uri" not in im and "bufferView" in im for im in doc["images"])
    return raw, doc, binary


results = {}
for sex in ("female",):
    source = HERE / "originals" / "dada-dopamine-face-projected.glb"
    source_raw, original, binary = read_glb(source)
    image_views = {im["bufferView"]: i for i, im in enumerate(original["images"])}
    roughness_images = {
        original["textures"][material["pbrMetallicRoughness"]["metallicRoughnessTexture"]["index"]]["source"]
        for material in original["materials"]
    }
    results[sex] = {"source": source.name, "source_sha256": sha(source_raw), "variants": {}}
    for compact in (False, True):
        doc = copy.deepcopy(original)
        # These new source exports are unrigged complete outfits. Keep the
        # authored surface and rendering attributes without inventing joints.
        for mesh in doc["meshes"]:
            for primitive in mesh["primitives"]:
                primitive["attributes"] = {k: value for k, value in primitive["attributes"].items() if not k.startswith(("JOINTS_", "WEIGHTS_"))}
        used_accessors = sorted({value for mesh in doc["meshes"] for primitive in mesh["primitives"] for value in [primitive["indices"], *primitive["attributes"].values()]})
        accessor_map = {old: new for new, old in enumerate(used_accessors)}
        for mesh in doc["meshes"]:
            for primitive in mesh["primitives"]:
                primitive["indices"] = accessor_map[primitive["indices"]]
                primitive["attributes"] = {key: accessor_map[value] for key, value in primitive["attributes"].items()}
        doc["accessors"] = [doc["accessors"][index] for index in used_accessors]
        used_views = sorted({a["bufferView"] for a in doc["accessors"]} | set(image_views))
        view_map = {old: new for new, old in enumerate(used_views)}
        for accessor in doc["accessors"]:
            accessor["bufferView"] = view_map[accessor["bufferView"]]
        for image in doc["images"]:
            image["bufferView"] = view_map[image["bufferView"]]
        doc["bufferViews"] = [doc["bufferViews"][index] for index in used_views]
        doc["nodes"] = [{"name": f"Dada_{sex}_dopamine_complete_outfit", "mesh": 0}]
        doc["scenes"] = [{"nodes": [0]}]
        doc["scene"] = 0
        doc.pop("skins", None)
        out = bytearray()
        images = []
        unchanged = 0
        for index in used_views:
            view = original["bufferViews"][index]
            start = view.get("byteOffset", 0)
            data = binary[start:start + view["byteLength"]]
            assert len(data) == view["byteLength"]
            if index in image_views:
                image_index = image_views[index]
                image = Image.open(io.BytesIO(data)).convert("RGB")
                original_size = image.size
                limit = (4096 if compact else 8192) if image_index == 0 else (2048 if compact else 4096)
                image.thumbnail((limit, limit), Image.Resampling.LANCZOS)
                if image_index in roughness_images:
                    # Generated metallic noise makes fabric look like coated plastic.
                    # Keep the authored pattern but impose a dielectric, matte floor.
                    red, green, blue = image.split()
                    image = Image.merge("RGB", (red, green.point(lambda value: max(174, value)), blue.point(lambda _: 0)))
                stream = io.BytesIO()
                if image_index == 1:
                    image.save(stream, format="PNG", optimize=True)
                    mime = "image/png"
                else:
                    image.save(stream, format="JPEG", quality=95, subsampling=0, optimize=True)
                    mime = "image/jpeg"
                data = stream.getvalue()
                doc["images"][image_index]["mimeType"] = mime
                images.append({"index": image_index, "source_size": original_size, "size": image.size, "bytes": len(data), "mime": mime})
                image.close()
            else:
                unchanged += 1
            out.extend(b"\0" * ((-len(out)) % 4))
            doc["bufferViews"][view_map[index]]["byteOffset"] = len(out)
            doc["bufferViews"][view_map[index]]["byteLength"] = len(data)
            out.extend(data)
        doc["buffers"][0]["byteLength"] = len(out)
        doc["asset"]["copyright"] = "Original fictional adult character generated with Tripo Studio for the project account. See NOTICE.txt and PROVENANCE.json."
        for material in doc["materials"]:
            material.setdefault("extras", {})["avatarRecolor"] = False
            material["pbrMetallicRoughness"]["metallicFactor"] = 0
        document = json.dumps(doc, separators=(",", ":")).encode("utf-8")
        document += b" " * ((-len(document)) % 4)
        out.extend(b"\0" * ((-len(out)) % 4))
        raw = struct.pack("<III", 0x46546C67, 2, 28 + len(document) + len(out))
        raw += struct.pack("<II", len(document), 0x4E4F534A) + document
        raw += struct.pack("<II", len(out), 0x004E4942) + out
        name = sex + ("-mobile" if compact else "") + ".glb"
        target = PUBLIC / name
        target.write_bytes(raw)
        _, check, packed = read_glb(target)
        for index in used_views:
            view = original["bufferViews"][index]
            if index in image_views:
                continue
            original_payload = binary[view.get("byteOffset", 0):view.get("byteOffset", 0) + view["byteLength"]]
            new_view = check["bufferViews"][view_map[index]]
            new_payload = packed[new_view["byteOffset"]:new_view["byteOffset"] + new_view["byteLength"]]
            assert sha(original_payload) == sha(new_payload), "Geometry or skin data changed"
        results[sex]["variants"][name] = {"bytes": len(raw), "sha256": sha(raw), "presentation": "fixed-pose-complete-outfit", "bones": 0, "unchanged_geometry_views": unchanged, "images": images}
        print(name, len(raw), sha(raw), flush=True)

(PUBLIC / "PROVENANCE.json").write_text(json.dumps({"generated": "2026-10-18", "generator": "Tripo Studio H3.1", "geometry": "150k triangles, fixed-pose complete outfits, embedded PBR textures", "notice": "Original 8K dopamine outfit source assets retained privately in verification/dopamine-avatar/originals; web base-color textures 8K desktop / 4K compact. Original rest-surface geometry, UVs and normals are unchanged. These generated assets are complete, unrigged outfits; they do not support articulated pose changes or individual garment replacement.", "license_source": "https://www.tripo3d.ai/terms", "license_section": "5.2.2 Paid Users; project-owned generated outputs, no CC0 claim", "models": results}, indent=2) + "\n", encoding="utf-8")
