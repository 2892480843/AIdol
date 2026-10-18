"""Finalize selected coherent character and thumbnails from actual 3D renders."""
from pathlib import Path
import hashlib
import json
import struct
from PIL import Image, ImageOps, ImageDraw

HERE = Path(__file__).resolve().parent
PUBLIC = HERE.parents[1]/'frontend/public/models/avatar/dopamine-v1'
manifest = json.loads((HERE/'generation-manifest.json').read_text())
provenance = json.loads((PUBLIC/'PROVENANCE.json').read_text())
provenance['selected_tasks'] = manifest['tasks']
provenance['reference_sha256'] = manifest['references']
provenance['portrait_source'] = 'dada-dopamine-head-150k-8k.glb'
provenance['portrait_source_sha256'] = hashlib.sha256((HERE/'originals'/provenance['portrait_source']).read_bytes()).hexdigest()
provenance['presentation'] = 'coherent fixed-pose full-body reconstruction; portrait base-color projection'
provenance['face_projection'] = json.loads((HERE/'face-projection.json').read_text())
provenance['rejected_experiments'] = 'Separate portrait/head mesh splices failed hairline/neck close-up inspection and are not in the shipped model.'
provenance['geometry_source'] = 'dada-dopamine-body-150k-8k.glb'
raw = (HERE/'originals'/provenance['geometry_source']).read_bytes()
length = struct.unpack_from('<I', raw, 12)[0]
doc = json.loads(raw[20:20+length])
binary = raw[28+length:]
primitive = doc['meshes'][0]['primitives'][0]
provenance['original_geometry_views'] = {}
for name, index in {**primitive['attributes'], 'indices': primitive['indices']}.items():
    view = doc['bufferViews'][doc['accessors'][index]['bufferView']]
    payload = binary[view.get('byteOffset', 0):view.get('byteOffset', 0)+view['byteLength']]
    provenance['original_geometry_views'][name] = hashlib.sha256(payload).hexdigest()
provenance['original_body_sha256'] = hashlib.sha256(raw).hexdigest()
(PUBLIC/'PROVENANCE.json').write_text(json.dumps(provenance, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
with Image.open(HERE/'female-dopamine-full-front.png') as image:
    ImageOps.fit(image.convert('RGB'), (160, 220), method=Image.Resampling.LANCZOS).save(PUBLIC/'female.webp', quality=94)
sheet = Image.new('RGB', (900, 440), '#faf7f4')
draw = ImageDraw.Draw(sheet)
for column, angle in enumerate(('front', 'side', 'back')):
    with Image.open(HERE/f'female-dopamine-full-{angle}.png') as render:
        image = ImageOps.contain(render.convert('RGB'), (298, 410), Image.Resampling.LANCZOS)
        sheet.paste(image, (column*300+(300-image.width)//2, 0))
    draw.text((column*300+10, 420), f'{angle} / actual 3D render', fill='#333333')
sheet.save(HERE/'actual-model-contact.jpg', quality=95)
