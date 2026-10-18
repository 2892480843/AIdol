"""Record source and local release identity without exposing container credentials."""
import hashlib
import json
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = Path(__file__).resolve().parent
DOCKER = "/Applications/Docker.app/Contents/Resources/bin/docker"
ENV = {**os.environ, "PATH": str(Path(DOCKER).parent) + ":" + os.environ.get("PATH", "")}
MANIFESTS = {
    "frontend": OUT / "frontend-manifest.json",
    "backend": OUT / "backend/source-manifest-full-final.json",
}


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def run(*args):
    return subprocess.check_output(args, cwd=ROOT, env=ENV, text=True)


def source_files(component):
    document = json.loads(MANIFESTS[component].read_text())
    return document.get("files", document)


if sys.argv[1] == "snapshot":
    files = {}
    for path in sorted((ROOT / "frontend").rglob("*")):
        relative = path.relative_to(ROOT)
        if not path.is_file() or any(part in {"node_modules", ".next", "coverage", ".git"} for part in relative.parts):
            continue
        if path.name.startswith(".env") or path.name in {".DS_Store", "tsconfig.tsbuildinfo"}:
            continue
        files[str(relative)] = digest(path)
    MANIFESTS["frontend"].write_text(json.dumps({"scope": "frontend source and local assets, excluding secrets, dependencies and generated files", "files": files}, indent=2) + "\n")
    print(json.dumps({name: {"files": len(source_files(name)), "manifest_sha256": digest(path)} for name, path in MANIFESTS.items()}, indent=2))
elif sys.argv[1] == "runtime":
    results = {}
    for name, path in MANIFESTS.items():
        files = source_files(name)
        info = json.loads(run(DOCKER, "inspect", f"wardrobe-{name}"))[0]
        results[name] = {
            "files": len(files),
            "mismatches": [key for key, value in files.items() if digest(ROOT / key) != value],
            "manifest_sha256": digest(path),
            "image": info["Config"]["Image"],
            "image_id": info["Image"],
            "label": info["Config"]["Labels"].get("com.dada.source-manifest-sha256"),
            "mount_destinations": [mount["Destination"] for mount in info["Mounts"]],
        }
        results[name]["label_matches"] = results[name]["manifest_sha256"] == results[name]["label"]
    results["frontend"]["build_id"] = run(str(ROOT / "local.sh"), "exec", "-T", "frontend", "cat", ".next/BUILD_ID").strip()
    results["backend"]["studio_runtime_sha256"] = run(str(ROOT / "local.sh"), "exec", "-T", "backend", "sha256sum", "/app/app/services/studio_service.py").split()[0]
    results["backend"]["studio_matches"] = results["backend"]["studio_runtime_sha256"] == digest(ROOT / "backend/app/services/studio_service.py")
    raw = run(str(ROOT / "local.sh"), "ps", "--format", "json")
    (OUT / "services-final.jsonl").write_text(raw)
    services = []
    for line in raw.splitlines():
        value = json.loads(line)
        services.extend(value if isinstance(value, list) else [value])
    results["services"] = [{key: row.get(key) for key in ("Service", "State", "Health")} for row in services]
    (OUT / "runtime-final.json").write_text(json.dumps(results, indent=2) + "\n")
    print(json.dumps(results, indent=2))
    assert all(not results[name]["mismatches"] and results[name]["label_matches"] for name in MANIFESTS)
    assert results["backend"]["studio_matches"]
    assert all(row["State"] == "running" for row in services)
else:
    raise SystemExit("Use snapshot or runtime")
