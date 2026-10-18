"""Check reversible DDL on the dedicated test database, then save a local production backup."""
import json,os,subprocess
from pathlib import Path
from urllib.parse import quote
root=Path(__file__).resolve().parents[2]
docker='/Applications/Docker.app/Contents/Resources/bin/docker'
info=json.loads(subprocess.check_output([docker,'inspect','wardrobe-db']))[0]
values=dict(value.split('=',1) for value in info['Config']['Env'])
user=values.get('POSTGRES_USER','postgres');password=values.get('POSTGRES_PASSWORD','');database=values.get('POSTGRES_DB',user)
test_url=f'postgresql+asyncpg://{quote(user,safe="")}:{quote(password,safe="")}@postgres:5432/wardrobe_direct_tryon_test_20261018'
env={**os.environ,'DATABASE_URL':test_url,'DEBUG':'true','SECRET_KEY':'local-migration-process-only'}
for revision in ['a1b2c3d4e5f7','head']:
 operation='downgrade' if revision!='head' else 'upgrade'
 subprocess.run([docker,'run','--rm','--network','wardrowbe_default','--entrypoint','python','-e','DATABASE_URL','-e','DEBUG','-e','SECRET_KEY','wardrowbe-backend:direct-tryon-20261018','-m','alembic',operation,revision],env=env,check=True)
backup=root/'backups/direct-tryon-20261018';backup.mkdir(parents=True,exist_ok=True);backup.chmod(0o700)
fd=os.open(backup/'database-before.dump',os.O_WRONLY|os.O_CREAT|os.O_TRUNC,0o600)
with os.fdopen(fd,'wb') as output:
 subprocess.run([docker,'exec','wardrobe-db','pg_dump','-U',user,'-d',database,'-Fc'],stdout=output,check=True)
state=subprocess.check_output([docker,'exec','wardrobe-db','psql','-U',user,'-d',database,'-At','-c','SELECT version_num FROM alembic_version; SELECT count(*) FROM try_on_tasks;'],text=True)
(root/'verification/direct-tryon/migration-before.txt').write_text(state)
print('Dedicated test database downgrade/upgrade passed; production backup saved locally with mode 0600.')
