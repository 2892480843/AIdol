"""Collect local verification identities without exporting runtime environment."""

import hashlib
import json
import re
import subprocess
import xml.etree.ElementTree as ET
from datetime import UTC, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "verification" / "architecture"


def command(*args):
    return subprocess.check_output(args, cwd=ROOT, text=True).strip()


def write(name, value):
    (OUT / name).write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n")


def main():
    files = command("git", "ls-files", "-co", "--exclude-standard", "-z").split("\0")
    files = sorted({name for name in files if name and (ROOT / name).is_file()})
    secrets = set()
    for name in (".env", ".env.ai.local", ".env.architecture.local"):
        for line in (ROOT / name).read_text().splitlines():
            key, separator, value = line.partition("=")
            if separator and re.search(r"KEY|SECRET|PASSWORD|TOKEN", key):
                value = value.strip().strip("\"'")
                if len(value) >= 16:
                    secrets.add(value.encode())
    matches = [name for name in files if any(secret in (ROOT / name).read_bytes() for secret in secrets)]
    write("secret-scan.json", {"reviewable_files": len(files), "configured_credentials_checked": len(secrets),
                               "configured_credential_matches": len(matches), "matching_files": matches})
    assert not matches, "A configured credential appears in a reviewable file"

    source = [name for name in files if name.startswith(("backend/", "frontend/", "ops/"))
              or name in ("local.sh", "docker-compose.yml", "docker-compose.local.yml", "docker-compose.architecture.yml")]
    manifest = {name: hashlib.sha256((ROOT / name).read_bytes()).hexdigest() for name in source}
    write("source-checksums.json", manifest)

    services = [json.loads(line) for line in command("./local.sh", "ps", "--format", "json").splitlines()]
    write("runtime-services.json", [{key: row.get(key) for key in ("Service", "State", "Health", "Image", "Name")} for row in services])
    assert len(services) == 10 and all(row["State"] == "running" for row in services)

    images = {name: command("docker", "image", "inspect", f"wardrowbe-{name}:architecture-20261017", "--format", "{{.Id}}")
              for name in ("backend", "frontend")}
    running_images = {row["Service"]: command("docker", "inspect", row["Name"], "--format", "{{.Image}}")
                      for row in services if row["Service"] in ("backend", "frontend", "worker", "image-worker", "task-worker", "task-dispatcher")}
    assert all(digest == images["frontend" if service == "frontend" else "backend"]
               for service, digest in running_images.items()), "A running service uses an older project image"
    backend_source = {name.removeprefix("backend/"): digest for name, digest in manifest.items()
                      if name.startswith(("backend/app/", "backend/migrations/", "backend/scripts/"))}
    audit = "import pathlib,hashlib,json; root=pathlib.Path('/app'); print(json.dumps({str(p.relative_to(root)):hashlib.sha256(p.read_bytes()).hexdigest() for d in ('app','migrations','scripts') for p in (root/d).rglob('*') if p.is_file() and '__pycache__' not in p.parts and p.suffix!='.pyc'}))"
    baked = json.loads(command("./local.sh", "exec", "-T", "backend", "python", "-c", audit))
    mismatches = [name for name, digest in backend_source.items() if baked.get(name) != digest]
    assert not mismatches, "Running backend source differs from the reviewed workspace"
    write("deployment-images.json", {"checked_at": datetime.now(UTC).isoformat(), "image_ids": images, "running_image_ids": running_images,
                                      "backend_source_files_compared": len(backend_source),
                                      "backend_source_mismatches": mismatches,
                                      "git_head_observed": command("git", "rev-parse", "HEAD")})

    backend = ET.parse(OUT / "backend-tests-final.xml").getroot().find("testsuite").attrib
    frontend = json.loads((OUT / "frontend-tests-final.json").read_text())
    assert backend["failures"] == backend["errors"] == backend["skipped"] == "0"
    assert frontend["numFailedTests"] == frontend["numPendingTests"] == 0
    summary = {"checked_at": datetime.now(UTC).isoformat(), "platform": command("uname", "-sm"),
               "backend_tests": int(backend["tests"]), "frontend_tests": frontend["numPassedTests"],
               "failures": 0, "skips": 0, "running_services": len(services),
               "credential_matches": 0, "backend_source_mismatches": 0, "images": images}
    write("SUMMARY.json", summary)
    print(json.dumps(summary, ensure_ascii=False))


if __name__ == "__main__":
    main()
