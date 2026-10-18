"""Use an isolated test DB and a disposable Redis; no model credentials are passed."""
import json, os, subprocess, sys
from pathlib import Path
from urllib.parse import quote
root=Path(__file__).resolve().parents[2]
docker='/Applications/Docker.app/Contents/Resources/bin/docker'
def inspect(name): return json.loads(subprocess.check_output([docker,'inspect',name]))[0]
values=dict(value.split('=',1) for value in inspect('wardrobe-db')['Config']['Env'])
user=quote(values.get('POSTGRES_USER','postgres'),safe='')
password=quote(values.get('POSTGRES_PASSWORD',''),safe='')
dbname='wardrobe_direct_tryon_test_20261018'
url=f'postgresql+asyncpg://{user}:{password}@postgres:5432/{dbname}'
redis_name=f'dada-fitting-test-redis-{os.getpid()}'
redis_image=inspect('wardrobe-redis')['Config']['Image']
env={**os.environ,'TEST_DATABASE_URL':url,'DATABASE_URL':url,'REDIS_URL':f'redis://{redis_name}:6379/0','STORAGE_PATH':'/tmp/fitting-tests','AI_BASE_URL':'http://127.0.0.1:9/v1','AI_API_KEY':'test-no-external-model'}
try:
 subprocess.run([docker,'run','--detach','--network','wardrowbe_default','--name',redis_name,redis_image],check=True,stdout=subprocess.DEVNULL)
 args=[docker,'run','--rm','--network','wardrowbe_default','--entrypoint','python','-w','/workspace/backend','-v',f'{root}:/workspace:ro','-v',f'{root}/verification/direct-tryon:/evidence','-e','TEST_DATABASE_URL','-e','DATABASE_URL','-e','REDIS_URL','-e','STORAGE_PATH','wardrowbe-backend:tryon-20261017-r2','-m','pytest',*(['tests'] if '--full' in sys.argv else ['tests/test_tryon.py','tests/test_tryon_multi.py','tests/test_items.py']),'-o','cache_dir=/tmp/pytest-cache','--junitxml=/evidence/backend-full.xml' if '--full' in sys.argv else '--junitxml=/evidence/backend-integration.xml','-q']
 result=subprocess.run(args,env=env)
 sys.exit(result.returncode)
finally:
 subprocess.run([docker,'rm','--force',redis_name],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
