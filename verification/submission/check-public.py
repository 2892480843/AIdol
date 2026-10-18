"""Read-only public login and product check; credential JSON stays outside Git."""
from __future__ import annotations

import base64
from datetime import datetime
import http.cookiejar
import json
from pathlib import Path
import sys
import urllib.error
import urllib.parse
import urllib.request
from zoneinfo import ZoneInfo

credentials = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
base = credentials["url"].rstrip("/")
basic = "Basic " + base64.b64encode(
    f"{credentials['user']}:{credentials['password']}".encode()
).decode()
opener = urllib.request.build_opener(
    urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar())
)
report = {"checked_at": datetime.now(ZoneInfo("Asia/Shanghai")).isoformat(),
          "url": base, "read_only_business_check": True, "checks": []}


def request(path, *, authenticated=True, token=None, data=None):
    headers = {"Authorization": f"Bearer {token}" if token else basic} if authenticated else {}
    if data is not None:
        headers["Content-Type"] = "application/x-www-form-urlencoded"
        data = urllib.parse.urlencode(data).encode()
    req = urllib.request.Request(base + path, data=data, headers=headers)
    try:
        with opener.open(req, timeout=30) as response:
            body = response.read()
            value = json.loads(body) if "json" in response.headers.get("Content-Type", "") else None
            return response.status, value
    except urllib.error.HTTPError as error:
        return error.code, None


status, _ = request("/dashboard", authenticated=False)
assert status == 401, f"Unauthenticated access: {status}"
report["checks"].append({"name": "unauthenticated denied", "status": status})
status, health = request("/api/v1/health/ready")
assert status == 200 and health["status"] == "healthy"
report["health"] = health
_, csrf = request("/api/auth/csrf")
status, _ = request("/api/auth/callback/forward-auth", data={
    "csrfToken": csrf["csrfToken"], "callbackUrl": base + "/dashboard", "json": "true"
})
assert status == 200
_, session = request("/api/auth/session")
token = session.get("accessToken")
assert token and not session.get("syncError")
report["checks"].append({"name": "dedicated reviewer browser login", "status": "passed"})
for path in ["/dashboard", "/dashboard/wardrobe", "/dashboard/suggest", "/dashboard/outfits",
             "/dashboard/looks", "/dashboard/wardrobe/avatar", "/dashboard/wardrobe/extract",
             "/dashboard/wardrobe/tryon"]:
    status, _ = request(path)
    assert status == 200, f"{path}: {status}"
    report["checks"].append({"path": path, "status": status})
for path in ["/api/v1/items", "/api/v1/outfits", "/api/v1/tasks"]:
    status, value = request(path, token=token)
    assert status == 200, f"{path}: {status}"
    count = value.get("total", len(value.get("tasks", []))) if isinstance(value, dict) else len(value)
    report["checks"].append({"path": path, "status": status, "count": count})
status, value = request("/api/v1/tasks", token=token)
report["recommendation_tasks"] = [{"id": t["id"], "status": t["status"], "attempts": t["attempts"], "error_code": t.get("error_code")} for t in value["tasks"]]
report["status"] = "passed"
output = Path(__file__).with_name("public-check.json")
output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(json.dumps(report, ensure_ascii=False, indent=2))
