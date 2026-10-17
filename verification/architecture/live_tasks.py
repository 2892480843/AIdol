"""Deployed API/proxy + real model + durable queue + private S3 acceptance.

Run in an ephemeral backend container with this directory mounted at /evidence.
On restart_worker_now, the operator SIGKILLs and starts only task-worker.
No credentials are saved in this report; all accounts and images are synthetic.
"""
import io
import json
import re
import time
from datetime import datetime
from pathlib import Path
from uuid import uuid4

import httpx
from PIL import Image, ImageDraw

BASE = "http://frontend:3000/api/v1"
client = httpx.Client(base_url=BASE, timeout=30)
report = {"started_at": datetime.now().isoformat(), "checks": []}
output = Path("/evidence/live-tasks.json")
weather = {"temperature": 22, "feels_like": 22, "condition": "clear"}


def save():
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")


def req(method, path, expected=(200,), **kwargs):
    response = client.request(method, path, **kwargs)
    assert response.status_code in expected, f"{method} {path}: {response.status_code} {response.text[:200]}"
    return response.json()


def check(name, function):
    started = time.monotonic()
    try:
        detail = function()
        item = {"name": name, "passed": True, "detail": detail}
    except Exception as error:
        item = {"name": name, "passed": False, "error": str(error)}
    item["seconds"] = round(time.monotonic() - started, 2)
    report["checks"].append(item)
    save()
    print(json.dumps(item, ensure_ascii=False), flush=True)
    if not item["passed"]:
        raise SystemExit(1)


def login(label):
    email = f"architecture-{label}-{uuid4().hex[:8]}@example.com"
    user = req("POST", "/auth/sync", json={"external_id": email, "email": email, "display_name": "架构验收"})
    client.headers["Authorization"] = "Bearer " + user["access_token"]
    req("PATCH", "/users/me", json={"locale": "zh-CN", "timezone": "Asia/Shanghai"})
    return user


def seed_items():
    ids = []
    for kind, color in [("t-shirt", "blue"), ("pants", "black"), ("sneakers", "white")]:
        im = Image.new("RGB", (300, 300), "#dddddd")
        ImageDraw.Draw(im).rectangle((65, 35, 235, 265), fill=color)
        b = io.BytesIO()
        im.save(b, format="PNG")
        item = req("POST", "/items", expected=(201,), data={"name": "架构样衣-" + kind, "skip_ai": "true", "type": kind, "primary_color": color, "colors": color},
                   files={"image": (kind + ".png", b.getvalue(), "image/png")})
        ids.append(item["id"])
        image = client.get("http://frontend:3000" + item["image_url"])
        assert image.status_code == 200 and image.headers["content-type"].startswith("image/")
    return ids


def submit(count=1, *, key=None):
    return req("POST", "/tasks/recommendations", expected=(202,), json={"occasion": "casual", "count": count, "weather_override": weather},
               headers={"Idempotency-Key": key or str(uuid4()), "X-Request-ID": "architecture-live-" + uuid4().hex[:12]})


def poll(task_id, expected="succeeded", seconds=240):
    observed = []
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        task = req("GET", "/tasks/" + task_id)
        state = (task["status"], task["stage"], task["attempts"])
        if not observed or observed[-1] != state:
            observed.append(state)
            print(json.dumps({"event": "task_state", "task_id": task_id, "state": state}), flush=True)
        if task["status"] in ("succeeded", "failed", "cancelled"):
            assert task["status"] == expected, task
            return task, observed
        time.sleep(0.5)
    raise AssertionError("Task did not reach a terminal state")


owner = login("owner")
owner_token = client.headers["Authorization"]
clothing_ids = seed_items()
report["test_user_id"] = owner["id"]


def durable_generation():
    key = str(uuid4())
    task = submit(3, key=key)
    replay = submit(3, key=key)
    assert replay["id"] == task["id"]
    # Fresh HTTP client represents a page reload; server state carries the job.
    with httpx.Client(base_url=BASE, headers={"Authorization": owner_token}) as fresh:
        assert fresh.get("/tasks/" + task["id"]).status_code == 200
    final, states = poll(task["id"])
    ids = final["result"]["outfit_ids"]
    assert len(ids) == 3 and len(set(ids)) == 3
    for outfit_id in ids:
        outfit = req("GET", "/outfits/" + outfit_id)
        assert {item["id"] for item in outfit["items"]} <= set(clothing_ids)
        assert re.search(r"[\u4e00-\u9fff]", outfit["reasoning"] or "")
    report["completed_task_id"] = task["id"]
    report["outfit_ids"] = ids
    return {"task_id": task["id"], "outfits": len(ids), "states": states, "idempotency_reused": True, "reload_state": True}


check("Real Chinese AI generation, idempotency and reload state", durable_generation)


def cancellation():
    task = submit()
    cancelled = req("POST", "/tasks/" + task["id"] + "/cancel")
    assert cancelled["status"] == "cancelled"
    time.sleep(3)
    final = req("GET", "/tasks/" + task["id"])
    assert final["status"] == "cancelled" and final["result"] is None
    return {"task_id": task["id"], "status": final["status"]}


check("Cancellation remains terminal", cancellation)


def owner_scope_and_retry():
    other = login("empty")
    assert req("GET", "/tasks/" + report["completed_task_id"], expected=(404,))
    failed = submit()
    initial, _ = poll(failed["id"], "failed")
    assert initial["error_code"] == "insufficient_wardrobe"
    seed_items()
    retry = req("POST", "/tasks/" + failed["id"] + "/retry")
    assert retry["status"] == "queued"
    final, _ = poll(failed["id"])
    client.headers["Authorization"] = owner_token
    return {"cross_user_access": 404, "failed_task_retried": final["id"], "final_status": final["status"]}


check("Ownership and failed task retry after adding clothing", owner_scope_and_retry)


def recovery():
    task = submit()
    deadline = time.monotonic() + 20
    while time.monotonic() < deadline:
        running = req("GET", "/tasks/" + task["id"])
        if running["status"] == "running":
            break
        time.sleep(0.1)
    assert running["status"] == "running"
    print(json.dumps({"event": "restart_worker_now", "task_id": task["id"]}), flush=True)
    final, states = poll(task["id"])
    assert final["attempts"] >= 2, "Worker restart must interrupt the first execution"
    assert len(final["result"]["outfit_ids"]) == 1
    return {"task_id": task["id"], "attempts": final["attempts"], "states": states, "committed_outfits": 1}


check("SIGKILL worker recovery and single committed result", recovery)
report["passed"] = len(report["checks"])
report["failed"] = 0
save()
print(json.dumps({"event": "complete", "passed": report["passed"]}), flush=True)
