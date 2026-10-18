import hashlib,json,os,subprocess
from pathlib import Path
root=Path(__file__).resolve().parents[2]
docker='/Applications/Docker.app/Contents/Resources/bin/docker'
env={**os.environ,'PATH':str(Path(docker).parent)+':'+os.environ.get('PATH','')}
services_text=subprocess.check_output([str(root/'local.sh'),'ps','--format','json'],env=env,cwd=root,text=True)
(root/'verification/direct-tryon/services-final.jsonl').write_text(services_text)
services=[]
for line in services_text.splitlines():
 value=json.loads(line);services.extend(value if isinstance(value,list) else [value])
labels={}
for component in ['frontend','backend']:
 info=json.loads(subprocess.check_output([docker,'inspect',f'wardrobe-{component}']))[0]
 manifest=root/f'verification/direct-tryon/{component}-manifest.json';m=json.loads(manifest.read_text())
 labels[component]={'files':len(m['files']),'mismatches':[name for name,digest in m['files'].items() if hashlib.sha256((root/name).read_bytes()).hexdigest()!=digest],'manifest_sha256':hashlib.sha256(manifest.read_bytes()).hexdigest(),'runtime_label':info['Config']['Labels'].get('com.dada.source-manifest-sha256'),'image':info['Config']['Image'],'image_id':info['Image']}
 result=labels[component];result['label_matches']=result['manifest_sha256']==result['runtime_label']
info=json.loads(subprocess.check_output([docker,'inspect','wardrobe-db']))[0];values=dict(value.split('=',1) for value in info['Config']['Env'])
user=values.get('POSTGRES_USER','postgres');database=values.get('POSTGRES_DB',user)
sql="SELECT json_build_object('revision',(SELECT version_num FROM alembic_version),'task_count',count(*),'tasks',json_agg(json_build_object('id',id,'item_id',item_id,'item_ids',item_ids,'status',status,'error_code',error_code,'created_at',created_at,'updated_at',updated_at) ORDER BY created_at DESC)) FROM try_on_tasks WHERE user_id='27e521de-ba2d-47d8-8de5-4884553d7c9b';"
tasks=json.loads(subprocess.check_output([docker,'exec','wardrobe-db','psql','-U',user,'-d',database,'-At','-c',sql],text=True))
(root/'verification/direct-tryon/live-tasks.json').write_text(json.dumps(tasks,indent=2)+'\n')
result={'components':labels,'running_services':sum(s['State']=='running' for s in services),'health':{s['Service']:s['Health'] for s in services if s.get('Health')},'revision':tasks['revision'],'demo_tasks':tasks['task_count'],'latest_task':tasks['tasks'][0]}
(root/'verification/direct-tryon/final-consistency.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result,indent=2))
