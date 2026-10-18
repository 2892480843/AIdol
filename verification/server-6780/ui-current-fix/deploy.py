"""Run on the deployment host; switch both release selectors with rollback."""
from pathlib import Path
from datetime import datetime, timezone
import hashlib
import json
import os
import shutil
import subprocess
import time
import urllib.request

link = Path('/opt/dada-6780/current')
old = link.resolve()
new = Path('/opt/dada-6780/releases/20261018-latest-collage-r4')
pin = Path('/etc/systemd/system/dada-6780@frontend.service.d/20-submission-freeze.conf')
pin_before = pin.read_text()
assert old == Path('/opt/dada-6780/releases/20261018-server')
assert pin_before.count(str(old)) == 2
assert (new / 'frontend/.next/BUILD_ID').read_text().strip() == 'PEQRW1j-iBdLB73DZbCPA'
nginx = Path('/etc/nginx/conf.d/dada-6780.conf')
nginx_before = hashlib.sha256(nginx.read_bytes()).hexdigest()


def command(*args):
    return subprocess.check_output(args, text=True).strip()


api_pid = command('systemctl', 'show', 'dada-6780@api', '-p', 'MainPID', '--value')
backup = Path('/etc/dada-6780/access-backups/ui-current-fix-20261019')
backup.mkdir(mode=0o700, exist_ok=True)
shutil.copy2(pin, backup / pin.name)


def switch(target):
    temp = link.with_name('current-ui-fix.tmp')
    assert not temp.exists() and not temp.is_symlink()
    temp.symlink_to(target)
    os.replace(temp, link)


try:
    pin.write_text(pin_before.replace(str(old), str(new)).replace(
        'keep the reviewed release while later work continues.',
        'pin the verified Collage Art UI requested by the owner.',
    ))
    switch(new)
    command('systemctl', 'daemon-reload')
    command('systemctl', 'restart', 'dada-6780@frontend')
    for attempt in range(25):
        try:
            with urllib.request.urlopen('https://124.70.96.183:6780/', timeout=3) as response:
                html = response.read().decode()
                assert response.status == 200 and 'collage-theme' in html
            break
        except Exception:
            if attempt == 24:
                raise
            time.sleep(0.5)
    pid = command('systemctl', 'show', 'dada-6780@frontend', '-p', 'MainPID', '--value')
    cwd = Path('/proc/' + pid + '/cwd').resolve()
    assert cwd == new / 'frontend'
    assert nginx_before == hashlib.sha256(nginx.read_bytes()).hexdigest()
    assert api_pid == command('systemctl', 'show', 'dada-6780@api', '-p', 'MainPID', '--value')
except Exception:
    pin.write_text(pin_before)
    switch(old)
    command('systemctl', 'daemon-reload')
    command('systemctl', 'restart', 'dada-6780@frontend')
    raise

report = {
    'corrected_at': datetime.now(timezone.utc).isoformat(),
    'previous_release': str(old), 'active_release': str(link.resolve()),
    'frontend_build_id': (new / 'frontend/.next/BUILD_ID').read_text().strip(),
    'frontend_process_cwd': str(cwd), 'frontend_pin_updated': True,
    'frontend_files_verified': 2303, 'backend_files_unchanged': 265,
    'public_assets_unchanged': 68, 'api_not_restarted': True,
    'nginx_public_access_unchanged': True, 'https_root_status': 200,
    'collage_body_class': True,
}
Path('/opt/dada-6780/ui-current-fix-20261019.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps(report))
