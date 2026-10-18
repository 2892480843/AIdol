"""Exercise the real Linux ARM64 service with a locally authored CC0 avatar render."""
import base64
import hashlib
import io
import json
from pathlib import Path
import subprocess
import time

ROOT = Path(__file__).resolve().parents[2]
OUT = Path(__file__).resolve().parent / 'production-extraction'
OUT.mkdir(exist_ok=True)
DOCKER = '/Applications/Docker.app/Contents/Resources/bin/docker'
source = ROOT / 'verification/video-quality/asset-work/renders/female-sweet-front.png'
program = '''import json,platform,sys,time
from pathlib import Path
from app.services.clothing_extraction import capabilities,extract_clothing
t=time.monotonic()
r=extract_clothing(Path("/tmp/dada-extraction-cc0-fixture.png").read_bytes())
r["verification"]={"platform":platform.machine(),"seconds":round(time.monotonic()-t,3),"capabilities":capabilities()}
print(json.dumps(r))
'''
started = time.monotonic()
subprocess.run([DOCKER,'cp',str(source),'wardrobe-backend:/tmp/dada-extraction-cc0-fixture.png'],check=True,timeout=60)
run = subprocess.run([DOCKER,'exec','wardrobe-backend','python','-c',program], capture_output=True, timeout=100)
if run.returncode:
    raise RuntimeError(run.stderr.decode()[-2000:])
result = json.loads(run.stdout)
for piece in result['pieces']:
    raw = base64.b64decode(piece.pop('thumbnail_data_url').split(',',1)[1])
    (OUT / f'{piece["type"]}.png').write_bytes(raw)
    piece['png_sha256'] = hashlib.sha256(raw).hexdigest()
result['source_sha256'] = hashlib.sha256(source.read_bytes()).hexdigest()
result['wall_seconds'] = round(time.monotonic()-started,3)
(OUT / 'result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(result,ensure_ascii=False,indent=2))
assert result['verification']['platform'] in {'aarch64','arm64'}
assert result['verification']['capabilities']['available']
assert {'top','skirt','shoes'}.issubset(p['type'] for p in result['pieces'])
