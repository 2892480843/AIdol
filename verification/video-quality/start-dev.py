"""Reuse the authorized local frontend settings in memory; never print credentials."""
import json, os, subprocess
from pathlib import Path
root=Path(__file__).resolve().parents[2]
docker='/Applications/Docker.app/Contents/Resources/bin/docker'
rows=json.loads(subprocess.check_output([docker,'inspect','wardrobe-frontend'],text=True))[0]['Config']['Env']
settings=dict(row.split('=',1) for row in rows if '=' in row)
allowed={key:value for key,value in settings.items() if key in {'DEV_MODE','NEXTAUTH_SECRET','FORWARD_AUTH_SECRET'} or key.startswith(('OIDC_','NEXT_PUBLIC_'))}
env={**os.environ,**allowed}
env.pop('NODE_ENV',None)
backend_address=subprocess.check_output([docker,'port','wardrobe-backend','8000/tcp'],text=True).strip().splitlines()[0]
if not backend_address.startswith('127.0.0.1:'):raise SystemExit('Unexpected backend exposure')
env.update(BACKEND_URL='http://'+backend_address, NEXTAUTH_URL='http://localhost:3001', NEXT_TELEMETRY_DISABLED='1', NODE_OPTIONS='--max-old-space-size=1024')
log=(root/'verification/video-quality/dev-server.log').open('a')
p=subprocess.Popen(['npm','run','dev','--','--port','3001','--hostname','127.0.0.1'], cwd=root/'frontend',env=env,stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
(root/'verification/video-quality/dev-pid.txt').write_text(str(p.pid)+'\n')
print('Dev frontend PID:',p.pid)
