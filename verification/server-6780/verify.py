"""Verify the public deployment using its real browser login flow.

The credentials file stays outside the repository. Tokens and cookies are never
written to the report. Only the dedicated demo account receives sample garments.
"""

import base64
import http.cookiejar
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[2]
OUT = Path(__file__).resolve().parent
credentials = json.loads(Path(sys.argv[1]).read_text())
BASE = credentials["url"]
basic = "Basic " + base64.b64encode(
    (credentials["user"] + ":" + credentials["password"]).encode()
).decode()
jar = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
report = {"url": BASE, "checks": [], "items": []}
token = None


def request(method, path, *, body=None, headers=None, expected=200, frontend=False):
    hdr = dict(headers or {})
    if frontend:
        hdr["Authorization"] = basic
    elif token:
        hdr["Authorization"] = "Bearer " + token
    if isinstance(body, dict):
        body = json.dumps(body).encode()
        hdr["Content-Type"] = "application/json"
    req = urllib.request.Request(BASE + path, data=body, headers=hdr, method=method)
    try:
        with opener.open(req, timeout=180) as res:
            data = res.read()
            assert res.status == expected, (path, res.status)
            return json.loads(data) if "json" in res.headers.get("Content-Type", "") else data
    except urllib.error.HTTPError as error:
        if error.code == expected:
            return None
        raise RuntimeError(f"{method} {path}: HTTP {error.code}") from None


def multipart(fields, field, path):
    boundary = "dada-server-" + uuid4().hex
    chunks = []
    for key, value in fields.items():
        chunks.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{key}"\r\n\r\n{value}\r\n'.encode())
    chunks.extend([
        f'--{boundary}\r\nContent-Disposition: form-data; name="{field}"; filename="{path.name}"\r\nContent-Type: image/png\r\n\r\n'.encode(),
        path.read_bytes(),
        f"\r\n--{boundary}--\r\n".encode(),
    ])
    return b"".join(chunks), {"Content-Type": f"multipart/form-data; boundary={boundary}"}


def run():
    request("GET", "/dashboard", expected=401)
    request("GET", "/api/v1/items", expected=401)
    report["checks"].append("unauthenticated pages and private API denied")
    health = request("GET", "/api/v1/health/ready")
    assert health["status"] == "healthy"
    csrf = request("GET", "/api/auth/csrf", frontend=True)["csrfToken"]
    request("POST", "/api/auth/callback/forward-auth", frontend=True,
            body=urllib.parse.urlencode({"csrfToken": csrf, "callbackUrl": BASE + "/dashboard", "json": "true"}).encode(),
            headers={"Content-Type": "application/x-www-form-urlencoded"})
    session = request("GET", "/api/auth/session", frontend=True)
    global token
    token = session.get("accessToken")
    assert token and not session.get("syncError"), "browser session has no backend identity"
    report["checks"].append("public Basic login -> NextAuth -> backend identity")
    report["user_id"] = session["user"]["id"]
    profile = request("PATCH", "/api/v1/users/me", body={"display_name": "云上码术演示", "locale": "zh-CN", "timezone": "Asia/Shanghai"})
    request("POST", "/api/v1/users/me/onboarding/complete")
    report["checks"].append("demo profile and onboarding persist")
    inventory = request("GET", "/api/v1/items")
    if not inventory["items"]:
        fixtures = ROOT / "verification/ui-redesign/fixtures/20261017-171957-e4b8a8"
        for filename, kind, color, name in [
            ("blue-shirt.png", "shirt", "blue", "蓝色衬衫（演示样例）"),
            ("black-pants.png", "pants", "black", "黑色长裤（演示样例）"),
            ("white-shoes.png", "shoes", "white", "白色运动鞋（演示样例）"),
        ]:
            body, headers = multipart({"name": name, "type": kind, "colors": color, "primary_color": color, "skip_ai": "true", "notes": "原创合成演示图片，不是真实用户衣物。"}, "image", fixtures / filename)
            request("POST", "/api/v1/items", body=body, headers=headers, expected=201)
        inventory = request("GET", "/api/v1/items")
    assert inventory["total"] >= 3
    for item in inventory["items"]:
        report["items"].append({"id": item["id"], "type": item["type"], "status": item["status"]})
        image = request("GET", item["thumbnail_url"])
        assert len(image) > 100
    report["checks"].append("three synthetic garments upload, list, and signed thumbnails")
    cap = request("GET", "/api/v1/clothing-extraction/capabilities")
    assert cap["available"]
    body, headers = multipart({}, "image", ROOT / "verification/look-switching/person-fixture.png")
    extracted = request("POST", "/api/v1/clothing-extraction", body=body, headers=headers)
    report["extraction"] = {"model": extracted["model"], "pieces": [{"type": p["type"], "confidence": p["confidence"]} for p in extracted["pieces"]]}
    assert extracted["pieces"]
    report["checks"].append("native x86_64 ONNX extraction returns real garment masks")
    assert request("GET", "/api/v1/tryon/capabilities")["available"]
    task = request("POST", "/api/v1/tasks/recommendations", expected=202,
                   body={"occasion": "casual", "count": 1, "weather_override": {"temperature": 22, "condition": "clear"}},
                   headers={"Idempotency-Key": "server-6780-initial-recommendation"})
    for _ in range(90):
        task = request("GET", "/api/v1/tasks/" + task["id"])
        if task["status"] in {"succeeded", "failed", "cancelled"}:
            break
        time.sleep(2)
    report["recommendation"] = {"id": task["id"], "status": task["status"], "attempts": task["attempts"], "error_code": task.get("error_code")}
    assert task["status"] == "succeeded", "real cloud recommendation did not succeed"
    report["checks"].append("durable queue -> cloud AI recommendation -> stored result")
    for path in ["/dashboard", "/dashboard/wardrobe", "/dashboard/suggest", "/dashboard/wardrobe/avatar", "/dashboard/wardrobe/tryon"]:
        html = request("GET", path, frontend=True)
        assert len(html) > 1000
    report["checks"].append("five authenticated production pages respond")
    report["status"] = "passed"


try:
    run()
except Exception as error:
    report["status"] = "failed"
    report["error"] = str(error)
finally:
    (OUT / "remote-smoke.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False), flush=True)
sys.exit(0 if report["status"] == "passed" else 1)
