import json,os,subprocess,shutil
from pathlib import Path
root=Path(__file__).resolve().parents[2]
docker="/Applications/Docker.app/Contents/Resources/bin/docker"
raw=subprocess.check_output([docker,"inspect","--format","{{json .Config.Env}}","wardrobe-frontend"],text=True)
env={**os.environ,**dict(v.split("=",1) for v in json.loads(raw))}
env.update(BACKEND_URL="http://127.0.0.1:18000",NEXTAUTH_URL="http://localhost:3001",NEXT_PUBLIC_API_URL="/api/v1",NODE_ENV="development",NEXT_TELEMETRY_DISABLED="1")
os.chdir(root/"frontend")
node=shutil.which("node",path=os.environ.get("PATH"))
os.execve(node,[node,"node_modules/next/dist/bin/next","dev","-p","3001"],env)
