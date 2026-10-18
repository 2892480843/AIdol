"""Exact runtime source, immutable model cache and original-byte verification."""
import hashlib, json, subprocess, urllib.request
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]; OUT=Path(__file__).resolve().parent
D='/Applications/Docker.app/Contents/Resources/bin/docker'
def run(*args): return subprocess.check_output(args,text=True,cwd=ROOT).strip()
backend=json.loads(run(D,'inspect','wardrobe-backend'))[0]
code="import hashlib,json;from pathlib import Path;p=Path('/app/app');print(json.dumps({str(f.relative_to(p)):hashlib.sha256(f.read_bytes()).hexdigest() for f in p.rglob('*.py')}))"
actual=json.loads(run(D,'exec','wardrobe-backend','python','-c',code))
expected={str(p.relative_to(ROOT/'backend/app')):hashlib.sha256(p.read_bytes()).hexdigest() for p in (ROOT/'backend/app').rglob('*.py')}
mismatch=[p for p,h in expected.items() if actual.get(p)!=h]
report={'backend':{'image':backend['Config']['Image'],'image_id':backend['Image'],'app_files':len(expected),'mismatches':mismatch,'mounts':[m['Destination'] for m in backend['Mounts']]}}
assert not mismatch, mismatch
revision=run('node','-e',"console.log(require('./frontend/next.config.js').env.NEXT_PUBLIC_AVATAR_ASSET_REVISION)")
script="const fs=require('fs');const s=fs.readFileSync('server.js','utf8');const c=JSON.parse(s.match(/const nextConfig = (.+)\\n/)[1]);console.log(c.env.NEXT_PUBLIC_AVATAR_ASSET_REVISION)"
actual_revision=run(D,'exec','wardrobe-frontend','node','-e',script)
assert revision==actual_revision, 'Model content revision differs between source and build'
path='/models/avatar/dopamine-v1/female.glb';url='http://localhost:3000'+path+'?v='+revision
with urllib.request.urlopen(url,timeout=60) as response:
 digest=hashlib.sha256();size=0
 while block:=response.read(256*1024):digest.update(block);size+=len(block)
 header=response.headers.get('Cache-Control');ctype=response.headers.get('Content-Type')
local=ROOT/'frontend/public'/path.lstrip('/')
report['model']={'revision':revision,'cache_control':header,'content_type':ctype,'bytes':size,'sha256':digest.hexdigest(),'source_sha256':hashlib.sha256(local.read_bytes()).hexdigest()}
assert digest.hexdigest()==report['model']['source_sha256']
assert header=='public, max-age=31536000, immutable', header
for label,suffix in [('unversioned',''),('wrong_revision','?v=old')]:
 req=urllib.request.Request('http://localhost:3000'+path+suffix,method='HEAD')
 with urllib.request.urlopen(req,timeout=30) as response:
  report['model'][label+'_cache_control']=response.headers.get('Cache-Control')
  assert 'immutable' not in report['model'][label+'_cache_control']
with urllib.request.urlopen('http://localhost:3000/api/v1/health',timeout=30) as response:
 report['health_status']=response.status
(OUT/'release-verification.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2))
