#!/bin/bash
set -euo pipefail
release=${1:?Pass the absolute release directory}
test -f "$release/frontend/server.js"
test -f "$release/backend/alembic.ini"
test -x /opt/dada-6780/venv/bin/uvicorn

install -m 644 "$release/ops/90-dada-6780-memory.conf" /etc/sysctl.d/
sysctl -p /etc/sysctl.d/90-dada-6780-memory.conf

if ! id dada6780 >/dev/null 2>&1; then
  useradd --system --home-dir /var/lib/dada-6780 --shell /usr/sbin/nologin dada6780
fi
install -d -m 751 /etc/dada-6780
chown root:dada6780 /etc/dada-6780/{backend,frontend}.env
chmod 640 /etc/dada-6780/{backend,frontend}.env
chown root:www-data /etc/dada-6780/htpasswd
chmod 640 /etc/dada-6780/htpasswd
chmod 600 /etc/dada-6780/{credentials.json,nginx.conf}
for service in api worker images tasks dispatcher; do
  ln -sfn backend.env "/etc/dada-6780/$service.env"
done

install -d /var/lib/dada-6780/{uploads,models,rembg/models/u2net,numba-cache}
install -m 644 "$release/schp-atr-18-int8-static.onnx" /var/lib/dada-6780/models/
install -m 644 "$release/u2net.onnx" /var/lib/dada-6780/rembg/models/u2net/
chown -R dada6780:dada6780 /var/lib/dada-6780
chmod 750 /var/lib/dada-6780 /var/lib/dada-6780/uploads
chmod +x "$release/ops/run-service.sh"
chown -R root:dada6780 "$release"
chown -R dada6780:dada6780 "$release/frontend/.next"

# The role and database are separate from the server's existing applications.
python3 - <<'PY'
import json, subprocess
from pathlib import Path
credentials=json.loads(Path('/etc/dada-6780/credentials.json').read_text())
password=credentials['database_password']
assert password.isalnum()
def psql(sql):
    return subprocess.run(['runuser','-u','postgres','--','psql','-X','-q','-v','ON_ERROR_STOP=1','-tAc',sql],text=True,capture_output=True,check=True).stdout.strip()
if psql("SELECT 1 FROM pg_roles WHERE rolname='dada6780'") != '1':
    psql("CREATE ROLE dada6780 LOGIN PASSWORD '"+password+"'")
if psql("SELECT 1 FROM pg_database WHERE datname='dada6780'") != '1':
    psql('CREATE DATABASE dada6780 OWNER dada6780')
PY

ln -sfn "$release" /opt/dada-6780/current
python3 - <<'PY'
import os,json,subprocess
from pathlib import Path
env=os.environ.copy()
for line in Path('/etc/dada-6780/backend.env').read_text().splitlines():
    if line and not line.startswith('#'):
        key,value=line.split('=',1);env[key]=json.loads(value)
subprocess.run(['/opt/dada-6780/venv/bin/python','-m','alembic','upgrade','head'],cwd='/opt/dada-6780/current/backend',env=env,check=True)
PY

install -m 644 "$release/ops/dada-6780@.service" /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now dada-6780@{api,worker,images,tasks,dispatcher,frontend}.service

# Public preset assets intentionally omit credentials in the browser loader.
python3 - "$release/ops/public-model-assets.nginx.conf" <<'PY_ASSETS'
from pathlib import Path
import sys
p = Path('/etc/dada-6780/nginx.conf')
s = p.read_text()
snippet = Path(sys.argv[1]).read_text()
if 'location ^~ /models/avatar/' not in s:
    marker = '    location /api/v1/ {'
    assert marker in s, 'Cannot locate API block in private nginx configuration'
    p.write_text(s.replace(marker, snippet + marker, 1))
PY_ASSETS

# Add one new listener, preserving all existing virtual hosts.
install -m 600 /etc/dada-6780/nginx.conf /etc/nginx/conf.d/dada-6780.conf
nginx -t
systemctl reload nginx
systemctl is-active dada-6780@{api,worker,images,tasks,dispatcher,frontend}.service
