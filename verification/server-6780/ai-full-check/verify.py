"""Exercise real AI flows on the deployed demo account, without recording secrets.

Run with the server venv: verify.py OUTPUT_DIR PERSON_FIXTURE [CHECK ...].
The person fixture depicts a fictional adult. Paid edits use a stable intent key;
rerunning the check reads the existing task rather than silently buying a retry.
"""
import base64
import hashlib
import http.cookiejar
import io
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image, ImageChops, ImageStat

OUT = Path(sys.argv[1])
OUT.mkdir(parents=True, exist_ok=True)
PERSON = Path(sys.argv[2])
STATE = OUT / "report.json"
report = json.loads(STATE.read_text()) if STATE.exists() else {
    "started_at": datetime.now(timezone.utc).isoformat(), "checks": {},
}
credentials = json.loads(Path("/etc/dada-6780/credentials.json").read_text())
BASE = "https://124.70.96.183:6780"
basic = "Basic " + base64.b64encode(
    (credentials["user"] + ":" + credentials["password"]).encode()
).decode()
opener = urllib.request.build_opener(
    urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar())
)
token = None


def save():
    report["updated_at"] = datetime.now(timezone.utc).isoformat()
    STATE.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")


def request(method, path, body=None, headers=None, frontend=False, expected=200):
    hdr = dict(headers or {})
    hdr["Authorization"] = basic if frontend else "Bearer " + (token or "")
    if isinstance(body, dict):
        body = json.dumps(body).encode()
        hdr["Content-Type"] = "application/json"
    try:
        with opener.open(urllib.request.Request(
            BASE + path, data=body, headers=hdr, method=method
        ), timeout=180) as response:
            data = response.read()
            assert response.status == expected, (path, response.status)
            return (json.loads(data) if "json" in response.headers.get("Content-Type", "")
                    else data)
    except urllib.error.HTTPError as error:
        detail = error.read(1500).decode(errors="replace")
        raise RuntimeError(f"{method} {path}: HTTP {error.code}: {detail}") from None


def multipart(fields, field, data, filename, mime="image/png"):
    boundary = "dada-ai-functional-check-20261018"
    chunks = []
    for key, value in fields.items():
        chunks.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{key}"\r\n\r\n{value}\r\n'.encode())
    chunks.extend([
        f'--{boundary}\r\nContent-Disposition: form-data; name="{field}"; filename="{filename}"\r\nContent-Type: {mime}\r\n\r\n'.encode(),
        data, f"\r\n--{boundary}--\r\n".encode(),
    ])
    return b"".join(chunks), {"Content-Type": "multipart/form-data; boundary=" + boundary}


def image_info(data):
    with Image.open(io.BytesIO(data)) as im:
        im.load()
        assert im.width > 32 and im.height > 32
        return {"width": im.width, "height": im.height, "format": im.format,
                "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()}


csrf = request("GET", "/api/auth/csrf", frontend=True)["csrfToken"]
request("POST", "/api/auth/callback/forward-auth",
        urllib.parse.urlencode({"csrfToken": csrf, "callbackUrl": BASE + "/dashboard", "json": "true"}).encode(),
        {"Content-Type": "application/x-www-form-urlencoded"}, frontend=True)
session = request("GET", "/api/auth/session", frontend=True)
token = session.get("accessToken")
assert token and not session.get("syncError"), "No backend session"
report["build_id"] = Path("/opt/dada-6780/current/frontend/.next/BUILD_ID").read_text().strip()
inventory = request("GET", "/api/v1/items")["items"]
by_type = {item["type"]: item for item in inventory if item["status"] == "ready"}
save()


def connectivity():
    health = request("GET", "/api/v1/health/ai")
    assert health["status"] == "healthy", health
    capabilities = request("GET", "/api/v1/capabilities")
    assert capabilities["ai"]["vision"] and capabilities["ai"]["text"]
    return {"health": health, "capabilities": capabilities["ai"]}


def tryon():
    cap = request("GET", "/api/v1/tryon/capabilities")
    assert cap["available"]
    selected = [by_type[k]["id"] for k in ["shirt", "pants", "shoes"]]
    body, headers = multipart({"consent": "true", "item_ids": json.dumps(selected)},
                              "person_image", PERSON.read_bytes(), "fictional-adult.png")
    headers["Idempotency-Key"] = "server-6780-real-ai-verification-outfit-20261018"
    task = request("POST", "/api/v1/tryon/tasks", body, headers, expected=202)
    report["tryon_task_id"] = task["id"]
    save()
    assert task["status"] == "succeeded", {"id": task["id"], "status": task["status"], "error_code": task.get("error_code")}
    image = request("GET", task["result_url"])
    (OUT / "tryon-result.jpg").write_bytes(image)
    persisted = request("GET", "/api/v1/tryon/tasks/" + task["id"])
    assert persisted["status"] == "succeeded"
    return {"task_id": task["id"], "status": task["status"], "model": cap["model"],
            "garment_count": len(selected), "image": image_info(image)}


def extraction():
    body, headers = multipart({}, "image", PERSON.read_bytes(), "fictional-adult.png")
    result = request("POST", "/api/v1/clothing-extraction", body, headers)
    assert result["pieces"]
    pieces = []
    for piece in result["pieces"]:
        data = base64.b64decode(piece["thumbnail_data_url"].split(",", 1)[1])
        info = image_info(data)
        with Image.open(io.BytesIO(data)) as im:
            assert im.mode == "RGBA" and im.getchannel("A").getextrema()[0] == 0
        (OUT / ("extracted-" + piece["type"] + ".png")).write_bytes(data)
        pieces.append({"type": piece["type"], "confidence": piece["confidence"], "image": info})
    assert (OUT / "extracted-top.png").exists()
    return {"model": result["model"], "pieces": pieces}


def tagging():
    if "tagging_item_id" not in report:
        body, headers = multipart({"name": "AI验收上装（虚构演示图）", "notes": "由原创虚构成年模特图提取，用于服务器真实AI功能验收。"},
                                  "image", (OUT / "extracted-top.png").read_bytes(), "extracted-top.png")
        item = request("POST", "/api/v1/items", body, headers, expected=201)
        report["tagging_item_id"] = item["id"]
        save()
    item_id = report["tagging_item_id"]
    for _ in range(100):
        item = request("GET", "/api/v1/items/" + item_id)
        if item["status"] in {"ready", "error"}:
            break
        time.sleep(2)
    assert item["status"] == "ready" and item["ai_processed"] and item["tagging_status"] == "tagged", {
        k: item.get(k) for k in ["id", "status", "ai_error", "ai_processed", "tagging_status"]}
    assert item["type"] != "unknown" and item["colors"]
    return {k: item.get(k) for k in ["id", "status", "type", "colors", "ai_processed", "ai_confidence", "tagging_status", "tagged_by"]}


def recommendation():
    task = request("POST", "/api/v1/tasks/recommendations",
                   {"occasion": "casual", "count": 1, "weather_override": {"temperature": 22, "condition": "clear"}},
                   {"Idempotency-Key": "server-6780-real-ai-verification-recommendation-20261018"}, expected=202)
    report["recommendation_task_id"] = task["id"]
    save()
    for _ in range(90):
        task = request("GET", "/api/v1/tasks/" + task["id"])
        if task["status"] in {"succeeded", "failed", "cancelled"}:
            break
        time.sleep(2)
    assert task["status"] == "succeeded" and task["result"], {k: task.get(k) for k in ["id", "status", "error_code", "error"]}
    return {k: task.get(k) for k in ["id", "status", "attempts", "result", "error_code"]}


def background():
    item_id = report["tagging_item_id"]
    original = request("GET", "/api/v1/items/" + item_id)
    before = request("GET", original["image_url"])
    result = request("POST", "/api/v1/items/" + item_id + "/remove-background", {"bg_color": "#E8E0D0"})
    assert result["original_image_path"]
    after = request("GET", result["image_url"])
    assert hashlib.sha256(before).digest() != hashlib.sha256(after).digest()
    (OUT / "background-result.jpg").write_bytes(after)
    info = image_info(after)
    restored = request("POST", "/api/v1/items/" + item_id + "/restore-original")
    assert restored["status"] == "ready"
    restored_bytes = request("GET", restored["image_url"])
    # Restoration regenerates JPEG variants; compare decoded content rather than
    # demanding byte identity after the documented lossy re-encoding step.
    with Image.open(io.BytesIO(before)) as first, Image.open(io.BytesIO(restored_bytes)) as second:
        assert first.size == second.size
        mean_difference = sum(ImageStat.Stat(ImageChops.difference(
            first.convert("RGB"), second.convert("RGB")
        )).mean) / 3
        assert mean_difference < 3, ("Original image not restored", mean_difference)
    return {"item_id": item_id, "image": info, "original_restored": True,
            "restored_pixel_mean_difference": round(mean_difference, 4)}


checks = {"connectivity": connectivity, "tryon": tryon, "extraction": extraction,
          "tagging": tagging, "recommendation": recommendation, "background": background}
selected_checks = sys.argv[3:] or list(checks)
for name in selected_checks:
    print(json.dumps({"check": name, "status": "started"}), flush=True)
    started = time.monotonic()
    try:
        detail = checks[name]()
        report["checks"][name] = {"status": "passed", "seconds": round(time.monotonic()-started, 2), "detail": detail}
    except Exception as exc:
        report["checks"][name] = {"status": "failed", "seconds": round(time.monotonic()-started, 2), "error": str(exc)}
    save()
    print(json.dumps({"check": name, **report["checks"][name]}, ensure_ascii=False), flush=True)
report["status"] = "passed" if len(report["checks"]) == len(checks) and all(x["status"] == "passed" for x in report["checks"].values()) else "failed"
save()
sys.exit(0 if report["status"] == "passed" else 1)
