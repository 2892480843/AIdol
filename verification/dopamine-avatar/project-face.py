"""Bake the high-detail portrait's facial appearance into a coherent body UV.

Only base-color texels in the frontal facial ellipse are blended. This keeps
the complete source body's actual geometry, hair, UVs and normals unchanged.
Alternative verification: geometry hashes and real front/side browser renders.
"""
from pathlib import Path
import io
import json
import struct
import numpy as np
from PIL import Image

HERE = Path(__file__).resolve().parent


def read(path):
    raw = path.read_bytes()
    length = struct.unpack_from('<I', raw, 12)[0]
    return json.loads(raw[20:20+length]), raw[28+length:]


def array(doc, binary, index):
    a = doc['accessors'][index]
    view = doc['bufferViews'][a['bufferView']]
    count = {'VEC3': 3, 'VEC2': 2, 'SCALAR': 1}[a['type']]
    return np.frombuffer(binary, dtype='<f4' if a['componentType'] == 5126 else '<u4', count=a['count']*count,
                         offset=view.get('byteOffset', 0)+a.get('byteOffset', 0)).reshape(-1, count).copy()


def surface(doc, binary):
    p = doc['meshes'][0]['primitives'][0]
    return (array(doc, binary, p['attributes']['POSITION']), array(doc, binary, p['attributes']['TEXCOORD_0']),
            array(doc, binary, p['indices']).reshape(-1, 3))


def image(doc, binary):
    source = doc['textures'][doc['materials'][0]['pbrMetallicRoughness']['baseColorTexture']['index']]['source']
    view = doc['bufferViews'][doc['images'][source]['bufferView']]
    return source, np.asarray(Image.open(io.BytesIO(binary[view.get('byteOffset', 0):view.get('byteOffset', 0)+view['byteLength']])).convert('RGB')).copy()


def raster(triangle, width, height):
    lower = np.maximum(np.floor(triangle.min(axis=0)).astype(int), 0)
    upper = np.minimum(np.ceil(triangle.max(axis=0)).astype(int)+1, [width, height])
    x0, y0 = lower
    x1, y1 = upper
    if x0 >= x1 or y0 >= y1:
        return None
    xx, yy = np.meshgrid(np.arange(x0, x1)+.5, np.arange(y0, y1)+.5)
    a, b, c = triangle
    denominator = (b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1])
    if abs(denominator) < 1e-8:
        return None
    wa = ((b[1]-c[1])*(xx-c[0])+(c[0]-b[0])*(yy-c[1]))/denominator
    wb = ((c[1]-a[1])*(xx-c[0])+(a[0]-c[0])*(yy-c[1]))/denominator
    weights = np.stack([wa, wb, 1-wa-wb], axis=-1)
    return (x0, y0, x1, y1), weights, (weights >= -.001).all(axis=-1)


head_doc, head_binary = read(HERE/'originals/dada-dopamine-head-150k-8k.glb')
hp, huv, hi = surface(head_doc, head_binary)
top = hp[:, 1].max()
hp *= 1.05
hp += [.004, 3.2-top*1.05, -.01]
_, head_image = image(head_doc, head_binary)
resolution = 1024
projection = np.zeros((resolution, resolution, 3), dtype=np.uint8)
depth = np.full((resolution, resolution), -np.inf)


def screen(points):
    return np.stack([(points[:, 0]+.23)/.46*(resolution-1), (3.14-points[:, 1])/.48*(resolution-1)], axis=-1)


hpixels = screen(hp)
for triangle in hi:
    p = hp[triangle]
    if p[:, 1].max() < 2.66 or p[:, 1].min() > 3.14 or abs(p[:, 0]).min() > .23 or p[:, 2].max() < 0:
        continue
    result = raster(hpixels[triangle], resolution, resolution)
    if result is None:
        continue
    (x0, y0, x1, y1), weights, inside = result
    z = weights @ p[:, 2]
    visible = inside & (z > depth[y0:y1, x0:x1])
    if not visible.any():
        continue
    uv = weights @ huv[triangle]
    sx = (uv[:, :, 0]*(head_image.shape[1]-1)).astype(int).clip(0, head_image.shape[1]-1)
    sy = (uv[:, :, 1]*(head_image.shape[0]-1)).astype(int).clip(0, head_image.shape[0]-1)
    projection[y0:y1, x0:x1][visible] = head_image[sy, sx][visible]
    depth[y0:y1, x0:x1][visible] = z[visible]
Image.fromarray(projection).save(HERE/'portrait-projection.png')

# Corresponding eye centers and mouth center, observed on the two orthographic
# source renders. Align facial features before baking to avoid doubled eyes/lips.
body_landmarks = np.asarray([[331, 486, 1], [600, 454, 1], [496, 720, 1]], dtype=float)
portrait_landmarks = np.asarray([[443, 451], [691, 426], [599, 685]], dtype=float)
face_mapping = np.linalg.solve(body_landmarks, portrait_landmarks)

doc, binary = read(HERE/'originals/dada-dopamine-body-150k-8k.glb')
bp, buv, bi = surface(doc, binary)
bp *= 3.2/bp[:, 1].max()
image_index, pixels = image(doc, binary)
original_pixels = pixels.copy()
height, width = pixels.shape[:2]
uvpixels = buv * [width-1, height-1]
changed = np.zeros((height, width), dtype=bool)
for triangle in bi:
    p = bp[triangle]
    if p[:, 1].max() < 2.72 or p[:, 1].min() > 3.10 or abs(p[:, 0]).min() > .18 or p[:, 2].max() < .02:
        continue
    result = raster(uvpixels[triangle], width, height)
    if result is None:
        continue
    (x0, y0, x1, y1), weights, inside = result
    world = weights @ p
    ellipse = (world[:, :, 0]/.155)**2 + ((world[:, :, 1]-2.905)/.183)**2
    amount = np.clip((1-ellipse)/.32, 0, 1)
    projected = screen(world.reshape(-1, 3)).reshape(*world.shape[:2], 2)
    projected = np.concatenate([projected, np.ones((*projected.shape[:2], 1))], axis=-1) @ face_mapping
    sx = projected[:, :, 0].astype(int).clip(0, resolution-1)
    sy = projected[:, :, 1].astype(int).clip(0, resolution-1)
    target = projection[sy, sx]
    old = original_pixels[y0:y1, x0:x1]
    hair = (old[:, :, 0] < 170) & (old[:, :, 1] < 135)
    central_features = (abs(world[:, :, 0]) < .105) & (world[:, :, 1] < 2.99) & (world[:, :, 1] > 2.77)
    valid = inside & (amount > 0) & np.isfinite(depth[sy, sx]) & (~hair | central_features) & (world[:, :, 2] > .025)
    patch = pixels[y0:y1, x0:x1]
    blended = old*(1-amount[:, :, None])+target*amount[:, :, None]
    patch[valid] = blended.clip(0, 255).astype(np.uint8)[valid]
    changed[y0:y1, x0:x1] |= valid
print('projected facial texels', int(changed.sum()), flush=True)
(HERE/'face-projection.json').write_text(json.dumps({'projection': 'frontal portrait-to-body base-color bake',
    'projected_texels': int(changed.sum()), 'geometry': 'source body geometry, UVs and normals unchanged',
    'ellipse': {'center_y': 2.905, 'radius_x': .155, 'radius_y': .183},
    'landmarks_body': body_landmarks.tolist(), 'landmarks_portrait': portrait_landmarks.tolist(),
    'body_to_portrait_affine': face_mapping.tolist(),
    'limits': 'Appearance transfer; does not change facial geometry or certify exact identity'}, indent=2)+'\n')
Image.fromarray(pixels).resize((2048, 2048)).save(HERE/'body-atlas-face-projection.jpg', quality=93)
stream = io.BytesIO()
Image.fromarray(pixels).save(stream, format='PNG')
image_view = doc['images'][image_index]['bufferView']
out = bytearray()
for index, view in enumerate(doc['bufferViews']):
    payload = stream.getvalue() if index == image_view else binary[view.get('byteOffset', 0):view.get('byteOffset', 0)+view['byteLength']]
    out.extend(b'\0' * ((-len(out)) % 4))
    view['byteOffset'] = len(out)
    view['byteLength'] = len(payload)
    out.extend(payload)
doc['images'][image_index]['mimeType'] = 'image/png'
doc['buffers'][0]['byteLength'] = len(out)
document = json.dumps(doc, separators=(',', ':')).encode('utf-8')
document += b' ' * ((-len(document)) % 4)
out.extend(b'\0' * ((-len(out)) % 4))
raw = struct.pack('<III', 0x46546c67, 2, 28+len(document)+len(out))
raw += struct.pack('<II', len(document), 0x4e4f534a)+document
raw += struct.pack('<II', len(out), 0x004e4942)+out
(HERE/'originals/dada-dopamine-face-projected.glb').write_bytes(raw)
