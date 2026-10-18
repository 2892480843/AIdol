"""Compare shipped public bytes, not only the image's source-manifest label."""
import hashlib,json,subprocess,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
PUBLIC=ROOT/'frontend/public'
expected={str(p.relative_to(PUBLIC)):hashlib.sha256(p.read_bytes()).hexdigest() for p in PUBLIC.rglob('*') if p.is_file()}
script="const fs=require('fs'),c=require('crypto');const out={};for(const p of JSON.parse(process.argv[1])){try{const b=fs.readFileSync('public/'+p);out[p]={bytes:b.length,sha256:c.createHash('sha256').update(b).digest('hex')}}catch(e){out[p]={missing:true}}}console.log(JSON.stringify(out));"
data=json.loads(subprocess.check_output(['/Applications/Docker.app/Contents/Resources/bin/docker','exec','wardrobe-frontend','node','-e',script,json.dumps(list(expected))],text=True,timeout=60))
result={'checked':len(expected),'mismatches':[{'path':p,'expected':h,**data[p]} for p,h in expected.items() if data[p].get('sha256')!=h]}
output=(ROOT/sys.argv[sys.argv.index('--output-dir')+1]).resolve() if '--output-dir' in sys.argv else ROOT/'verification/video-quality'
(output/'runtime-assets.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result,indent=2))
assert not result['mismatches']
