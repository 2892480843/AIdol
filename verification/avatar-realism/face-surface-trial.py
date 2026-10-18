"""Align the continuous body's face depth with the portrait used for its color.

No head splice, no image edits. Preserve all topology/UV/image bytes and keep
the displacement zero at the facial boundary. Diagnostic output only.
"""
import copy
import hashlib
import json
import struct
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]


def read(path):
    raw = path.read_bytes()
    length = struct.unpack_from("<I", raw, 12)[0]
    return raw, json.loads(raw[20:20 + length]), raw[28 + length:]


def array(doc, binary, index):
    a = doc['accessors'][index]
    view = doc['bufferViews'][a['bufferView']]
    width = {'VEC3': 3, 'VEC2': 2, 'SCALAR': 1}[a['type']]
    return np.frombuffer(binary, dtype='<f4' if a['componentType'] == 5126 else '<u4', count=a['count'] * width,
                         offset=view.get('byteOffset', 0) + a.get('byteOffset', 0)).reshape(-1, width).copy()


_, head_doc, head_binary = read(ROOT / 'verification/dopamine-avatar/originals/dada-dopamine-head-150k-8k.glb')
hprim = head_doc['meshes'][0]['primitives'][0]
hp = array(head_doc, head_binary, hprim['attributes']['POSITION'])
hi = array(head_doc, head_binary, hprim['indices']).reshape(-1, 3)
top = hp[:, 1].max()
hp *= 1.05
hp += [.004, 3.2 - top * 1.05, -.01]
resolution = 1024


def screen(points):
    return np.stack([(points[:, 0] + .23) / .46 * (resolution - 1), (3.14 - points[:, 1]) / .48 * (resolution - 1)], axis=-1)


depth = np.full((resolution, resolution), -np.inf)
pixels = screen(hp)
for triangle in hi:
    points = hp[triangle]
    if points[:, 1].max() < 2.70 or points[:, 1].min() > 3.10 or points[:, 2].max() < 0:
        continue
    projected = pixels[triangle]
    x0, y0 = np.maximum(np.floor(projected.min(axis=0)).astype(int), 0)
    x1, y1 = np.minimum(np.ceil(projected.max(axis=0)).astype(int) + 1, [resolution, resolution])
    if x0 >= x1 or y0 >= y1:
        continue
    xx, yy = np.meshgrid(np.arange(x0, x1) + .5, np.arange(y0, y1) + .5)
    a, b, c = projected
    denominator = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1])
    if abs(denominator) < 1e-8:
        continue
    wa = ((b[1] - c[1]) * (xx - c[0]) + (c[0] - b[0]) * (yy - c[1])) / denominator
    wb = ((c[1] - a[1]) * (xx - c[0]) + (a[0] - c[0]) * (yy - c[1])) / denominator
    weights = np.stack([wa, wb, 1 - wa - wb], axis=-1)
    inside = (weights >= -.001).all(axis=-1)
    z = weights @ points[:, 2]
    patch = depth[y0:y1, x0:x1]
    valid = inside & (z > patch)
    patch[valid] = z[valid]

source, doc, binary = read(ROOT / 'frontend/public/models/avatar/dopamine-v1/female.glb')
primitive = doc['meshes'][0]['primitives'][0]
original = array(doc, binary, primitive['attributes']['POSITION'])
normals = array(doc, binary, primitive['attributes']['NORMAL'])
indices = array(doc, binary, primitive['indices']).reshape(-1, 3)
scale = 3.2 / original[:, 1].max()
world = original * scale
mapping = np.asarray(json.loads((ROOT / 'verification/dopamine-avatar/face-projection.json').read_text())['body_to_portrait_affine'])
projected = np.concatenate([screen(world), np.ones((len(world), 1))], axis=1) @ mapping
x = np.clip(projected[:, 0].astype(int), 0, resolution - 1)
y = np.clip(projected[:, 1].astype(int), 0, resolution - 1)
target_depth = depth[y, x]
ellipse = (world[:, 0] / .145) ** 2 + ((world[:, 1] - 2.905) / .176) ** 2
weight = np.clip((1 - ellipse) / .4, 0, 1)
weight = weight * weight * (3 - 2 * weight)
valid = np.isfinite(target_depth) & (world[:, 2] > .07) & (normals[:, 2] > .12)
weight[~valid] = 0
edge = valid & (ellipse > .70) & (ellipse < .97)
if edge.sum() < 20:
    raise ValueError('Insufficient boundary alignment samples')
offset = float(np.median(world[edge, 2] - target_depth[edge]))
delta = np.zeros(len(world))
delta[valid] = np.clip(target_depth[valid] + offset - world[valid, 2], -.055, .055) * weight[valid]
world[:, 2] += delta
positions = original.copy()
positions[:, 2] += delta / scale
affected = np.abs(delta) > 1e-8
assert affected.sum() > 100
assert np.array_equal(positions[~affected], original[~affected])
assert np.isfinite(positions).all()

# Recompute the altered surface normals; untouched vertices retain authored normals.
points = positions[indices]
face_normals = np.cross(points[:, 1] - points[:, 0], points[:, 2] - points[:, 0])
smooth = np.zeros_like(positions)
for column in range(3):
    np.add.at(smooth, indices[:, column], face_normals)
lengths = np.linalg.norm(smooth, axis=1, keepdims=True)
smooth /= np.maximum(lengths, 1e-12)
new_normals = normals.copy()
new_normals[affected] = smooth[affected]
assert np.isfinite(new_normals).all()

out = bytearray(binary)
for attr, values in [('POSITION', positions), ('NORMAL', new_normals)]:
    accessor = doc['accessors'][primitive['attributes'][attr]]
    view = doc['bufferViews'][accessor['bufferView']]
    start = view.get('byteOffset', 0) + accessor.get('byteOffset', 0)
    payload = values.astype('<f4').tobytes()
    out[start:start + len(payload)] = payload
    if attr == 'POSITION':
        accessor['min'] = values.min(axis=0).tolist()
        accessor['max'] = values.max(axis=0).tolist()

for image in doc['images']:
    view = doc['bufferViews'][image['bufferView']]
    start, end = view['byteOffset'], view['byteOffset'] + view['byteLength']
    assert out[start:end] == binary[start:end]
header = json.dumps(doc, separators=(',', ':')).encode()
header += b' ' * (-len(header) % 4)
out.extend(b'\0' * (-len(out) % 4))
packed = struct.pack('<III', 0x46546C67, 2, 28 + len(header) + len(out))
packed += struct.pack('<II', len(header), 0x4E4F534A) + header
packed += struct.pack('<II', len(out), 0x004E4942) + out
(HERE / 'face-surface-trial.glb').write_bytes(packed)
report = {'status': 'experiment_not_released', 'changed_vertices': int(affected.sum()),
          'maximum_displacement_at_3_2_height': float(np.abs(delta).max()), 'depth_offset': offset,
          'preserved': ['triangle topology', 'UV bytes', 'all embedded image bytes', 'non-facial vertex positions'],
          'bytes': len(packed), 'sha256': hashlib.sha256(packed).hexdigest()}
(HERE / 'face-surface-trial.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps(report))
