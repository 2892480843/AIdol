"""Reconstruct a static complete outfit from separately authored head/body GLBs.

This exploratory asset pipeline is verified by finite geometry, embedded image
decoding, mesh boundaries and actual browser renders, not an aesthetic unit test.
"""
from pathlib import Path
import copy
import hashlib
import io
import json
import struct
import numpy as np
from PIL import Image

HERE = Path(__file__).resolve().parent
PUBLIC = HERE / 'originals/package-face-composite-experiment'
PUBLIC.mkdir(parents=True, exist_ok=True)
CUT = 2.72
HEAD_SCALE = 1.05


def sha(data):
    return hashlib.sha256(data).hexdigest()


def read_glb(path):
    raw = path.read_bytes()
    magic, version, total = struct.unpack_from('<III', raw)
    assert magic == 0x46546c67 and version == 2 and total == len(raw)
    length, kind = struct.unpack_from('<II', raw, 12)
    assert kind == 0x4e4f534a
    doc = json.loads(raw[20:20+length])
    size, kind = struct.unpack_from('<II', raw, 20+length)
    binary = raw[28+length:]
    assert kind == 0x004e4942 and size == len(binary)
    return raw, doc, binary


def accessor(doc, binary, index):
    a = doc['accessors'][index]
    view = doc['bufferViews'][a['bufferView']]
    dtype = {5126: '<f4', 5125: '<u4', 5123: '<u2'}[a['componentType']]
    columns = {'VEC3': 3, 'VEC2': 2, 'SCALAR': 1}[a['type']]
    offset = view.get('byteOffset', 0) + a.get('byteOffset', 0)
    stride = view.get('byteStride', columns * np.dtype(dtype).itemsize)
    return np.ndarray((a['count'], columns), dtype=dtype, buffer=binary,
                      offset=offset, strides=(stride, np.dtype(dtype).itemsize)).copy()


def clip(vertices, indices, above):
    """Clip crossed triangles, interpolating original normals and UVs at the cut."""
    triangles = vertices[indices.reshape(-1, 3)]
    inside = triangles[:, :, 1] >= CUT if above else triangles[:, :, 1] <= CUT
    output = [triangles[inside.all(axis=1)].reshape(-1, 8)]
    crossed = triangles[inside.any(axis=1) & ~inside.all(axis=1)]
    cut_faces = []
    for triangle in crossed:
        polygon = []
        for previous, current in zip(np.roll(triangle, 1, axis=0), triangle):
            a = previous[1] >= CUT if above else previous[1] <= CUT
            b = current[1] >= CUT if above else current[1] <= CUT
            if a != b:
                t = (CUT - previous[1]) / (current[1] - previous[1])
                edge = previous + t * (current - previous)
                edge[1] = CUT
                polygon.append(edge)
            if b:
                polygon.append(current)
        for i in range(1, len(polygon)-1):
            cut_faces.extend([polygon[0], polygon[i], polygon[i+1]])
    if cut_faces:
        output.append(np.asarray(cut_faces))
    unique, inverse = np.unique(np.concatenate(output).astype('<f4'), axis=0, return_inverse=True)
    unique[:, 3:6] /= np.maximum(np.linalg.norm(unique[:, 3:6], axis=1, keepdims=True), 1e-8)
    assert np.isfinite(unique).all() and len(inverse) % 3 == 0
    return unique, inverse.astype('<u4')


def hair_mask(doc, binary, vertices):
    source = doc['textures'][doc['materials'][0]['pbrMetallicRoughness']['baseColorTexture']['index']]['source']
    view = doc['bufferViews'][doc['images'][source]['bufferView']]
    image = np.asarray(Image.open(io.BytesIO(binary[view.get('byteOffset', 0):view.get('byteOffset', 0)+view['byteLength']])).convert('RGB'))
    x = (vertices[:, 6] * (image.shape[1]-1)).astype(int).clip(0, image.shape[1]-1)
    y = (vertices[:, 7] * (image.shape[0]-1)).astype(int).clip(0, image.shape[0]-1)
    color = image[y, x].astype(float)
    return (color[:, 0] < 210) & (color[:, 1] < 185) & (color[:, 2] < 175) & (color[:, 0] < color[:, 1]*2.2+5)


sources = []
for part in ('body', 'head'):
    path = HERE / 'originals' / f'dada-dopamine-{part}-150k-8k.glb'
    raw, doc, binary = read_glb(path)
    primitive = doc['meshes'][0]['primitives'][0]
    vertices = np.concatenate([accessor(doc, binary, primitive['attributes'][name])
                               for name in ('POSITION', 'NORMAL', 'TEXCOORD_0')], axis=1)
    if part == 'body':
        vertices[:, :3] *= 3.2 / vertices[:, 1].max()
    else:
        top = vertices[:, 1].max()
        vertices[:, :3] *= HEAD_SCALE
        vertices[:, :3] += [.004, 3.2 - top * HEAD_SCALE, -.01]
    source_indices = accessor(doc, binary, primitive['indices']).reshape(-1)
    hair = hair_mask(doc, binary, vertices)
    triangles = source_indices.reshape(-1, 3)
    if part == 'head':
        # Retain detailed portrait skin, eyes and lips, with the body's original
        # continuous hair covering the hidden head boundary.
        face = (abs(vertices[:, 0]) < .18) & (vertices[:, 2] > .015) & (vertices[:, 1] < 3.09)
        features = (abs(vertices[:, 0]) < .13) & (vertices[:, 2] > .05) & (vertices[:, 1] < 3.06)
        skin = face & (~hair | features)
        selected = triangles[skin[triangles].sum(axis=1) >= 2].reshape(-1)
        vertices, indices = clip(vertices, selected, True)
    else:
        old_face = (abs(vertices[:, 0]) < .12) & (vertices[:, 2] > .08) & (vertices[:, 1] < 3.10)
        selected = triangles[(hair[triangles] & ~old_face[triangles]).sum(axis=1) >= 2].reshape(-1)
        upper_hair, upper_indices = clip(vertices, selected, True)
        vertices, indices = clip(vertices, source_indices, False)
        offset = len(vertices)
        vertices = np.concatenate([vertices, upper_hair])
        indices = np.concatenate([indices, upper_indices + offset])
    sources.append((part, doc, binary, vertices, indices, sha(raw)))

# Conform the lower portrait collar to the actual full-body boundary. A hard
# horizontal splice leaves a visible floating neck because two reconstructions
# have different collar cross sections; only deform the lower neck, not the face.
body = sources[0][3]
body_triangles = sources[0][4].reshape(-1, 3)
segments = []
segment_vertices = []
for first, second in ((0, 1), (1, 2), (2, 0)):
    edges = body_triangles[:, [first, second]]
    edges = edges[np.all(abs(body[edges, 1] - CUT) < 1e-6, axis=1)]
    segments.extend(body[edges][:, :, [0, 2]])
    segment_vertices.extend(body[edges])
segments = np.asarray(segments)
segment_vertices = np.asarray(segment_vertices)
start = segments[:, 0]
delta = segments[:, 1] - start
denominator = np.maximum((delta * delta).sum(axis=1), 1e-12)
head = sources[1][3]
collar_targets = {}
head_hair = hair_mask(sources[1][1], sources[1][2], head)
for index in np.flatnonzero((head[:, 1] < CUT + .09) & (head[:, 1] >= CUT - 1e-6) & ~head_hair):
    point = head[index, [0, 2]]
    t = np.clip(((point - start) * delta).sum(axis=1) / denominator, 0, 1)
    projected = start + t[:, None] * delta
    nearest_index = ((projected - point)**2).sum(axis=1).argmin()
    nearest = projected[nearest_index]
    attributes = segment_vertices[nearest_index, 0] * (1-t[nearest_index]) + segment_vertices[nearest_index, 1] * t[nearest_index]
    weight = np.clip((CUT + .09 - head[index, 1]) / .09, 0, 1)
    weight = weight * weight * (3 - 2 * weight)
    head[index, [0, 2]] += (nearest - point) * weight
    head[index, 3:6] = head[index, 3:6] * (1-weight) + attributes[3:6] * weight
    head[index, 3:6] /= max(np.linalg.norm(head[index, 3:6]), 1e-8)
    collar_targets[index] = (attributes[6:8], weight)


def embedded_image(source, index):
    view = source[1]['bufferViews'][source[1]['images'][index]['bufferView']]
    binary = source[2]
    return Image.open(io.BytesIO(binary[view.get('byteOffset', 0):view.get('byteOffset', 0)+view['byteLength']])).convert('RGB')


def blend_collar(image):
    """Bake the body's collar colors into the portrait's lower UV triangles.

    Boundary normal/color continuity prevents an obvious horizontal splice while
    all facial geometry and facial texels above the short neck band stay intact.
    """
    body_image = np.asarray(embedded_image(sources[0], 0))
    pixels = np.asarray(image).copy()
    height, width = pixels.shape[:2]
    target_colors = {}
    for index, (uv, weight) in collar_targets.items():
        x = int(np.clip(uv[0] * (body_image.shape[1]-1), 0, body_image.shape[1]-1))
        y = int(np.clip(uv[1] * (body_image.shape[0]-1), 0, body_image.shape[0]-1))
        target_colors[index] = body_image[y, x].astype(float)
    for triangle in sources[1][4].reshape(-1, 3):
        if not any(int(index) in collar_targets for index in triangle):
            continue
        uv = head[triangle, 6:8] * [width-1, height-1]
        x0, y0 = np.maximum(np.floor(uv.min(axis=0)).astype(int), 0)
        x1, y1 = np.minimum(np.ceil(uv.max(axis=0)).astype(int)+1, [width, height])
        if x1 <= x0 or y1 <= y0:
            continue
        xx, yy = np.meshgrid(np.arange(x0, x1)+.5, np.arange(y0, y1)+.5)
        a, b, c = uv
        denominator = (b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1])
        if abs(denominator) < 1e-6:
            continue
        wa = ((b[1]-c[1])*(xx-c[0])+(c[0]-b[0])*(yy-c[1]))/denominator
        wb = ((c[1]-a[1])*(xx-c[0])+(a[0]-c[0])*(yy-c[1]))/denominator
        wc = 1-wa-wb
        mask = (wa >= -.02) & (wb >= -.02) & (wc >= -.02)
        weights = np.asarray([collar_targets.get(int(i), (None, 0))[1] for i in triangle])
        colors = np.asarray([target_colors.get(int(i), [0, 0, 0]) for i in triangle])
        contributions = np.stack([wa, wb, wc], axis=-1) * weights
        amount = contributions.sum(axis=-1).clip(0, 1)
        color = contributions @ colors
        patch = pixels[y0:y1, x0:x1]
        mixed = patch * (1-amount[:, :, None]) + color
        patch[mask] = mixed.clip(0, 255).astype(np.uint8)[mask]
    return Image.fromarray(pixels)

report = {'generated': '2026-10-18', 'generator': 'Tripo Studio H3.1',
          'presentation': 'fixed-pose-complete-outfit', 'bones': 0,
          'head_scale': HEAD_SCALE, 'cut_y': CUT, 'sources': [], 'variants': {}}
for part, doc, binary, vertices, indices, digest in sources:
    report['sources'].append({'part': part, 'sha256': digest, 'triangles_after_clip': len(indices)//3,
                              'bounds': [vertices[:, :3].min(axis=0).tolist(), vertices[:, :3].max(axis=0).tolist()]})

for compact in (False, True):
    out = bytearray()
    doc = {'asset': {'version': '2.0', 'generator': 'Dada portrait/full-body reconstruction',
                     'copyright': 'Project-owned generated adult fictional character. See NOTICE.txt and PROVENANCE.json.'},
           'scene': 0, 'scenes': [{'nodes': [0, 1]}], 'nodes': [], 'meshes': [],
           'materials': [], 'textures': [], 'images': [], 'samplers': [], 'accessors': [],
           'bufferViews': [], 'buffers': [{'byteLength': 0}]}
    images = []

    def append_view(data, target=None):
        out.extend(b'\0' * ((-len(out)) % 4))
        view = {'buffer': 0, 'byteOffset': len(out), 'byteLength': len(data)}
        if target:
            view['target'] = target
        doc['bufferViews'].append(view)
        out.extend(data)
        return len(doc['bufferViews'])-1

    def append_accessor(array, kind):
        data = array.astype('<u4' if kind == 'SCALAR' else '<f4')
        view = append_view(data.tobytes(), 34963 if kind == 'SCALAR' else 34962)
        doc['accessors'].append({'bufferView': view, 'componentType': 5125 if kind == 'SCALAR' else 5126,
                                 'type': kind, 'count': len(data),
                                 'min': data.reshape(len(data), -1).min(axis=0).tolist(),
                                 'max': data.reshape(len(data), -1).max(axis=0).tolist()})
        return len(doc['accessors'])-1

    for number, (part, original, binary, vertices, indices, digest) in enumerate(sources):
        doc['nodes'].append({'name': 'Dada_dopamine_' + part, 'mesh': number})
        attributes = {name: append_accessor(vertices[:, start:end], kind)
                      for name, start, end, kind in [('POSITION', 0, 3, 'VEC3'), ('NORMAL', 3, 6, 'VEC3'), ('TEXCOORD_0', 6, 8, 'VEC2')]}
        doc['meshes'].append({'name': part, 'primitives': [{'attributes': attributes,
                            'indices': append_accessor(indices, 'SCALAR'), 'material': number, 'mode': 4}]})
        image_offset = len(doc['images'])
        texture_offset = len(doc['textures'])
        sampler_offset = len(doc['samplers'])
        doc['samplers'].extend(copy.deepcopy(original.get('samplers', [])))
        for texture in original['textures']:
            texture = copy.deepcopy(texture)
            texture['source'] += image_offset
            if 'sampler' in texture:
                texture['sampler'] += sampler_offset
            doc['textures'].append(texture)
        material = copy.deepcopy(original['materials'][0])
        pbr = material['pbrMetallicRoughness']
        roughness_source = original['textures'][pbr['metallicRoughnessTexture']['index']]['source']
        base_source = original['textures'][pbr['baseColorTexture']['index']]['source']
        pbr['metallicFactor'] = 0
        material['extras'] = {'avatarRecolor': False}
        for holder in (material, pbr):
            for key, value in holder.items():
                if key.endswith('Texture') and isinstance(value, dict):
                    value['index'] += texture_offset
        doc['materials'].append(material)
        for i, image in enumerate(original['images']):
            cache = HERE / 'originals' / f'{part}-{i}-{compact}{"-collar-v3" if part == "head" and i == 0 else ""}.texture'
            view = original['bufferViews'][image['bufferView']]
            payload = binary[view.get('byteOffset', 0):view.get('byteOffset', 0)+view['byteLength']]
            decoded = Image.open(io.BytesIO(payload)).convert('RGB')
            if part == 'head' and i == 0 and not cache.exists():
                decoded = blend_collar(decoded)
            limit = (4096 if compact else 8192) if i == base_source else (2048 if compact else 4096)
            decoded.thumbnail((limit, limit), Image.Resampling.LANCZOS)
            if i == roughness_source:
                r, g, b = decoded.split()
                decoded = Image.merge('RGB', (r, g.point(lambda v: max(174, v)), b.point(lambda _: 0)))
            mime = 'image/png' if i == roughness_source else 'image/jpeg'
            if cache.exists():
                packed = cache.read_bytes()
            else:
                stream = io.BytesIO()
                if mime == 'image/png':
                    decoded.save(stream, format='PNG', optimize=True)
                else:
                    decoded.save(stream, format='JPEG', quality=95, subsampling=0, optimize=True)
                packed = stream.getvalue()
                cache.write_bytes(packed)
            doc['images'].append({'bufferView': append_view(packed), 'mimeType': mime})
            images.append({'part': part, 'index': i, 'size': list(decoded.size), 'bytes': len(packed)})
    doc['buffers'][0]['byteLength'] = len(out)
    document = json.dumps(doc, separators=(',', ':')).encode('utf-8')
    document += b' ' * ((-len(document)) % 4)
    out.extend(b'\0' * ((-len(out)) % 4))
    raw = struct.pack('<III', 0x46546c67, 2, 28 + len(document) + len(out))
    raw += struct.pack('<II', len(document), 0x4e4f534a) + document
    raw += struct.pack('<II', len(out), 0x004e4942) + out
    name = 'female-mobile.glb' if compact else 'female.glb'
    (PUBLIC / name).write_bytes(raw)
    read_glb(PUBLIC / name)
    report['variants'][name] = {'bytes': len(raw), 'sha256': sha(raw), 'images': images}
    print(name, len(raw), sha(raw), flush=True)
(PUBLIC / 'PROVENANCE.json').write_text(json.dumps(report, indent=2)+'\n', encoding='utf-8')
