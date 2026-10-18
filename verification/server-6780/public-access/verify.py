"""Exercise the public demo without HTTP credentials or pre-existing cookies."""
import hashlib
import http.cookiejar
import json
import re
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

BASE = 'https://124.70.96.183:6780'
opener = urllib.request.build_opener(
    urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar())
)


def request(path, data=None, headers=None):
    req = urllib.request.Request(BASE + path, data=data, headers=headers or {})
    with opener.open(req, timeout=60) as response:
        assert not response.headers.get('WWW-Authenticate')
        return response.read()


report = {'checked_at': datetime.now(timezone.utc).isoformat(), 'url': BASE}
try:
    request('/api/v1/items')
except urllib.error.HTTPError as exc:
    assert exc.code == 401, exc.code
else:
    raise AssertionError('Backend API must still require an application session')
report['backend_session_required'] = True
csrf = json.loads(request('/api/auth/csrf'))['csrfToken']
request('/api/auth/callback/forward-auth', urllib.parse.urlencode({
    'csrfToken': csrf, 'callbackUrl': BASE + '/dashboard', 'json': 'true',
}).encode(), {
    'Content-Type': 'application/x-www-form-urlencoded',
    'Remote-User': 'untrusted-client', 'Remote-Email': 'untrusted@example.org',
    'X-Forward-Auth-Secret': 'untrusted-client-value',
})
session = json.loads(request('/api/auth/session'))
assert session.get('accessToken') and not session.get('syncError')
assert session['user']['email'] == 'demo@dada.demo'
report['automatic_demo_login'] = 'passed'
report['client_identity_headers_overridden'] = True
auth = {'Authorization': 'Bearer ' + session['accessToken']}
items = json.loads(request('/api/v1/items', headers=auth))
assert items['total'] >= 3
report['inventory_count'] = items['total']
for item in items['items']:
    assert len(request(item['thumbnail_url'], headers=auth)) > 100
report['signed_thumbnails'] = 'passed'
assets = set()
report['pages'] = {}
for path in ['/dashboard', '/dashboard/wardrobe', '/dashboard/suggest',
             '/dashboard/wardrobe/avatar', '/dashboard/wardrobe/tryon', '/dashboard/looks']:
    html = request(path).decode()
    assert len(html) > 1000
    report['pages'][path] = 'passed'
    assets.update(re.findall(r'(?:src|href)="(/_next/[^" ]+)"', html))
for asset in sorted(assets):
    assert request(asset)
report['static_assets_checked'] = len(assets)
report['models'] = {}
root = Path(__file__).resolve().parents[3]
for relative in ['beauty-v2/female.glb', 'beauty-v2/male.glb']:
    local = root / 'frontend/public/models/avatar' / relative
    content = request('/models/avatar/' + relative)
    assert content[:4] == b'glTF'
    assert hashlib.sha256(content).digest() == hashlib.sha256(local.read_bytes()).digest()
    report['models'][relative] = {'unchanged': True, 'bytes': len(content)}
report['status'] = 'passed'
Path(__file__).with_name('result.json').write_text(
    json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8'
)
print(json.dumps(report, ensure_ascii=False, indent=2))
