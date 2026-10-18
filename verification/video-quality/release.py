"""Bind this release's exact frontend source/assets to the running local image."""
import hashlib,json,os,subprocess,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]; OUT=Path(__file__).resolve().parent
if '--output-dir' in sys.argv:
 OUT=(ROOT/sys.argv[sys.argv.index('--output-dir')+1]).resolve();OUT.mkdir(parents=True,exist_ok=True)
DOCKER='/Applications/Docker.app/Contents/Resources/bin/docker'
ENV={**os.environ,'PATH':str(Path(DOCKER).parent)+':'+os.environ.get('PATH','')}
def digest(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def run(*a):return subprocess.check_output(a,cwd=ROOT,env=ENV,text=True)
manifest=OUT/'frontend-manifest.json'
if sys.argv[1]=='snapshot':
 files={}
 for p in sorted((ROOT/'frontend').rglob('*')):
  rel=p.relative_to(ROOT)
  if not p.is_file() or any(x in {'node_modules','.next','coverage','.git'} for x in rel.parts):continue
  if p.name.startswith('.env') or p.name in {'.DS_Store','tsconfig.tsbuildinfo'}:continue
  files[str(rel)]=digest(p)
 manifest.write_text(json.dumps({'scope':'frontend source and public assets; no secrets/dependencies/build cache','files':files},indent=2)+'\n')
 print(json.dumps({'files':len(files),'sha256':digest(manifest)}))
elif sys.argv[1]=='runtime':
 subprocess.run([sys.executable,str(Path(__file__).with_name('verify-runtime-assets.py')),'--output-dir',str(OUT)],cwd=ROOT,env=ENV,check=True)
 files=json.loads(manifest.read_text())['files'];info=json.loads(run(DOCKER,'inspect','wardrobe-frontend'))[0]
 result={'files':len(files),'mismatches':[p for p,h in files.items() if digest(ROOT/p)!=h],'manifest_sha256':digest(manifest),'image':info['Config']['Image'],'image_id':info['Image'],'label':info['Config']['Labels'].get('com.dada.source-manifest-sha256'),'mounts':[m['Destination'] for m in info['Mounts']],'build_id':run(str(ROOT/'local.sh'),'exec','-T','frontend','cat','.next/BUILD_ID').strip()}
 result['label_matches']=result['manifest_sha256']==result['label'];(OUT/'runtime.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result,indent=2));assert not result['mismatches'] and result['label_matches']
else:raise SystemExit('snapshot or runtime')
