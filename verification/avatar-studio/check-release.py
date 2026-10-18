"""Snapshot source or inspect the local release without printing container secrets."""
import hashlib
import json
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "verification/avatar-studio"
DOCKER = "/Applications/Docker.app/Contents/Resources/bin/docker"
ENV = {**os.environ, "PATH": str(Path(DOCKER).parent) + ":" + os.environ.get("PATH", "")}
MANIFEST = OUT / "frontend-manifest.json"

def run(*args):
    return subprocess.check_output(args, cwd=ROOT, env=ENV, text=True)

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

if sys.argv[1] == "snapshot":
    files = {}
    for path in sorted((ROOT / "frontend").rglob("*")):
        relative = path.relative_to(ROOT)
        if not path.is_file() or any(part in {"node_modules", ".next", "coverage", ".git"} for part in relative.parts):
            continue
        if path.name.startswith(".env") or path.name in {".DS_Store", "tsconfig.tsbuildinfo"}:
            continue
        files[str(relative)] = digest(path)
    MANIFEST.write_text(json.dumps({"scope": "frontend source including local GLB assets, excluding secrets and generated build data", "files": files}, indent=2) + "\n")
    print(json.dumps({"files": len(files), "manifest_sha256": digest(MANIFEST)}))
elif sys.argv[1] == "runtime":
    sources = json.loads(MANIFEST.read_text())["files"]
    info = json.loads(run(DOCKER, "inspect", "wardrobe-frontend"))[0]
    raw_services = run(str(ROOT / "local.sh"), "ps", "--format", "json")
    (OUT / "services-final.jsonl").write_text(raw_services)
    services = []
    for line in raw_services.splitlines():
        row = json.loads(line)
        services.extend(row if isinstance(row, list) else [row])
    result = {
        "files": len(sources),
        "mismatches": [name for name, expected in sources.items() if digest(ROOT / name) != expected],
        "manifest_sha256": digest(MANIFEST),
        "runtime_label": info["Config"]["Labels"].get("com.dada.source-manifest-sha256"),
        "frontend_image": info["Config"]["Image"], "frontend_image_id": info["Image"],
        "backend_image": run(DOCKER, "inspect", "--format", "{{.Config.Image}} {{.Image}}", "wardrobe-backend").strip(),
        "build_id": run(str(ROOT / "local.sh"), "exec", "-T", "frontend", "cat", ".next/BUILD_ID").strip(),
        "running_services": sum(row["State"] == "running" for row in services),
        "health": {row["Service"]: row["Health"] for row in services if row.get("Health")},
    }
    result["label_matches"] = result["manifest_sha256"] == result["runtime_label"]
    (OUT / "runtime-final.json").write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps(result, indent=2))
    assert not result["mismatches"] and result["label_matches"]
elif sys.argv[1] in {"before", "after"}:
    info = json.loads(run(DOCKER, "inspect", "wardrobe-db"))[0]
    values = dict(value.split("=", 1) for value in info["Config"]["Env"])
    user = values.get("POSTGRES_USER", "postgres")
    database = values.get("POSTGRES_DB", user)
    owner = "27e521de-ba2d-47d8-8de5-4884553d7c9b"
    sql = f"""SELECT json_build_object(
      'outfits',(SELECT count(*) FROM outfits WHERE user_id='{owner}'),
      'tryon_tasks',(SELECT count(*) FROM try_on_tasks WHERE user_id='{owner}'),
      'wear_count',(SELECT coalesce(sum(wear_count),0) FROM clothing_items WHERE user_id='{owner}'),
      'test_outfits',(SELECT json_agg(json_build_object('id',o.id,'name',o.name,'scheduled_for',o.scheduled_for,'status',o.status,'items',(SELECT json_agg(item_id ORDER BY item_id) FROM outfit_items WHERE outfit_id=o.id))) FROM outfits o WHERE user_id='{owner}' AND name='3D工作室验收-20261018')
    );"""
    result = json.loads(run(DOCKER, "exec", "wardrobe-db", "psql", "-U", user, "-d", database, "-At", "-c", sql))
    (OUT / f"database-{sys.argv[1]}.json").write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n")
    print(json.dumps(result, indent=2, ensure_ascii=False))
else:
    raise SystemExit("Use snapshot, runtime, before or after")
