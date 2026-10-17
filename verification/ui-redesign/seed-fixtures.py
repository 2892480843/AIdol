"""Prepare isolated UI acceptance data through the existing frontend proxy.

Tokens stay in memory. This does not complete onboarding or exercise the new UI.
"""

import io
import json
import re
import urllib.error
import urllib.request
from datetime import datetime
from pathlib import Path
from uuid import uuid4

from PIL import Image, ImageDraw

BASE_URL = "http://localhost:3000/api/v1"
EVIDENCE = Path(__file__).resolve().parent


def fixture(kind):
    image = Image.new("RGB", (600, 600), "#edf0ec")
    draw = ImageDraw.Draw(image)
    if kind == "shirt":
        draw.polygon(
            [(210, 105), (105, 172), (135, 270), (180, 247), (180, 495),
             (420, 495), (420, 247), (465, 270), (495, 172), (390, 105),
             (352, 142), (248, 142)],
            fill="#3573bb", outline="#28558b", width=4,
        )
        draw.polygon([(248, 110), (300, 155), (270, 205), (225, 130)], fill="#80a6d0")
        draw.polygon([(352, 110), (300, 155), (330, 205), (375, 130)], fill="#80a6d0")
        draw.line([(300, 157), (300, 490)], fill="#28558b", width=3)
        for y in range(225, 465, 48):
            draw.ellipse((295, y, 303, y + 8), fill="#e9eef4")
    elif kind == "pants":
        draw.polygon(
            [(203, 83), (397, 83), (428, 510), (330, 510), (300, 270),
             (270, 510), (172, 510)],
            fill="#252729", outline="#151719", width=4,
        )
        draw.line([(203, 127), (400, 127)], fill="#5c6063", width=4)
        draw.line([(300, 127), (300, 250)], fill="#5c6063", width=3)
        draw.arc((206, 129, 284, 224), start=5, end=120, fill="#5c6063", width=3)
    else:
        for y in (195, 367):
            draw.polygon(
                [(120, y), (255, y - 37), (330, y + 30), (472, y + 45),
                 (495, y + 97), (120, y + 97)],
                fill="#ffffff", outline="#747c78", width=5,
            )
            draw.line([(125, y + 80), (485, y + 80)], fill="#bbc2be", width=5)
            for index in range(4):
                draw.line([(240 + index * 18, y), (285 + index * 18, y + 37)], fill="#9ba6a0", width=4)
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def multipart(fields, filename, content):
    boundary = "ui-redesign-" + uuid4().hex
    chunks = []
    for name, value in fields.items():
        chunks.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"\r\n\r\n{value}\r\n'.encode())
    chunks.extend([
        f'--{boundary}\r\nContent-Disposition: form-data; name="image"; filename="{filename}"\r\nContent-Type: image/png\r\n\r\n'.encode(),
        content,
        f"\r\n--{boundary}--\r\n".encode(),
    ])
    return b"".join(chunks), f"multipart/form-data; boundary={boundary}"


def request(method, path, expected=200, *, token=None, payload=None, form=None):
    headers = {}
    body = None
    if payload is not None:
        body = json.dumps(payload).encode()
        headers["Content-Type"] = "application/json"
    if form is not None:
        body, headers["Content-Type"] = form
    if token is not None:
        headers["Authorization"] = "Bearer " + token
    call = urllib.request.Request(BASE_URL + path, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(call, timeout=30) as response:
            assert response.status == expected, "Unexpected API status"
            return json.load(response)
    except urllib.error.HTTPError as error:
        raise AssertionError(f"{method} {path}: HTTP {error.code}") from None


def main():
    run = datetime.now().strftime("%Y%m%d-%H%M%S") + "-" + uuid4().hex[:6]
    email = f"ui-redesign-{run}@example.com"
    owner = request("POST", "/auth/sync", payload={
        "external_id": re.sub(r"[^a-z0-9]", "-", email.lower()),
        "email": email,
        "display_name": "UI 重构验收",
    })
    token = owner.pop("access_token")
    profile = request("PATCH", "/users/me", token=token, payload={"locale": "zh-CN", "timezone": "Asia/Shanghai"})
    assert profile["onboarding_completed"] is False, "Account onboarding must remain incomplete"
    directory = EVIDENCE / "fixtures" / run
    directory.mkdir(parents=True, exist_ok=False)
    items = []
    for kind, color, label in [("shirt", "blue", "蓝色衬衫"), ("pants", "black", "黑色长裤"), ("shoes", "white", "白色鞋子")]:
        filename = f"{color}-{kind}.png"
        content = fixture(kind)
        path = directory / filename
        path.write_bytes(content)
        item = request("POST", "/items", expected=201, token=token, form=multipart({
            "type": kind, "name": label + "（UI 验收）", "primary_color": color,
            "colors": color, "skip_ai": "true",
        }, filename, content))
        assert item["type"] == kind and item["primary_color"] == color
        assert item["status"] == "ready" and item["ai_processed"] is False
        items.append({"id": item["id"], "type": kind, "color": color, "path": str(path)})
    profile = request("GET", "/users/me", token=token)
    assert profile["onboarding_completed"] is False
    assert profile["locale"] == "zh-CN" and profile["timezone"] == "Asia/Shanghai"
    report = {
        "email": email, "user_id": owner["id"], "display_name": "UI 重构验收",
        "locale": profile["locale"], "timezone": profile["timezone"],
        "onboarding_completed": False, "items": items,
        "scope": "Synthetic data preparation through existing frontend proxy; new UI not verified",
    }
    (EVIDENCE / "seed-fixtures.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(json.dumps({"state": "failed", "error_type": type(error).__name__}), flush=True)
        raise SystemExit(1) from None
