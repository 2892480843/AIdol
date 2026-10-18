"""Package generated JS/CSS with the unchanged Linux runtime dependencies."""
from pathlib import Path
import hashlib
import json
import os
import platform
import subprocess
import sys
import tarfile

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
FRONTEND = ROOT / "frontend"
DOCKER = "/Applications/Docker.app/Contents/Resources/bin/docker"
BASE = "wardrowbe-frontend:ui-content-20261018-r3"
IMAGE = "wardrowbe-frontend:collage-style-20261018-r4"
ENV = {**os.environ, "PATH": str(Path(DOCKER).parent) + ":" + os.environ.get("PATH", "")}


def run(args):
    subprocess.run(args, cwd=ROOT, env=ENV, check=True)


baseline = json.loads((ROOT / "verification/ui-content/frontend-manifest.json").read_text())["files"]
for name in ("package.json", "package-lock.json"):
    assert hashlib.sha256((FRONTEND / name).read_bytes()).hexdigest() == baseline["frontend/" + name], "Linux dependency baseline changed"

standalone = FRONTEND / ".next/standalone"
build_id = (FRONTEND / ".next/BUILD_ID").read_text().strip()
assert (standalone / "server.js").is_file()
assert (standalone / ".next/BUILD_ID").read_text().strip() == build_id
release = HERE / "runtime-overlay"
release.mkdir(exist_ok=True)
archive = release / "runtime.tar.gz"
entries = []


def add_file(target, path, relative):
    assert "node_modules" not in relative.parts and "public" not in relative.parts
    assert not any(part.startswith(".env") for part in relative.parts)
    assert path.suffix != ".node", "Native binaries must stay in the Linux base image"
    info = target.gettarinfo(str(path), arcname=str(relative))
    info.uid = info.gid = 1001
    info.uname, info.gname = "nextjs", "nodejs"
    info.mtime = 0
    with path.open("rb") as source:
        target.addfile(info, source)
    entries.append(str(relative))


with tarfile.open(archive, "w:gz", compresslevel=1) as target:
    for path in sorted(standalone.rglob("*")):
        relative = path.relative_to(standalone)
        if "node_modules" in relative.parts or "public" in relative.parts or "cache" in relative.parts:
            continue
        if path.is_file():
            assert not path.is_symlink()
            add_file(target, path, relative)
    for directory in (FRONTEND / ".next/static", FRONTEND / "messages"):
        for path in sorted(directory.rglob("*")):
            if path.is_file():
                add_file(target, path, path.relative_to(FRONTEND))

assert "server.js" in entries and ".next/BUILD_ID" in entries
(release / "entries.json").write_text(json.dumps(entries, indent=2) + "\n", encoding="utf-8")
run([sys.executable, "verification/video-quality/release.py", "snapshot", "--output-dir", str(HERE)])
manifest_hash = hashlib.sha256((HERE / "frontend-manifest.json").read_bytes()).hexdigest()
(release / "Dockerfile").write_text(
    f"FROM {BASE}\nUSER root\nCOPY runtime.tar.gz /tmp/dada-runtime.tar.gz\n"
    "RUN rm -rf /app/.next && tar -xzf /tmp/dada-runtime.tar.gz -C /app "
    "&& rm /tmp/dada-runtime.tar.gz && mkdir -p /app/.next/cache "
    "&& chown nextjs:nodejs /app/.next/cache\n",
    encoding="utf-8",
)
run([DOCKER, "build", "--pull=false", "--label", "com.dada.source-manifest-sha256=" + manifest_hash, "-t", IMAGE, str(release)])
image_id = subprocess.check_output([DOCKER, "image", "inspect", "--format", "{{.Id}}", IMAGE], env=ENV, text=True).strip()
runtime_platform = subprocess.check_output([DOCKER, "image", "inspect", "--format", "{{.Os}}/{{.Architecture}}", IMAGE], env=ENV, text=True).strip()
(HERE / "build.json").write_text(json.dumps({
    "base": BASE, "image": IMAGE, "image_id": image_id,
    "manifest_sha256": manifest_hash, "build_id": build_id,
    "compiler_platform": platform.system() + "/" + platform.machine(), "runtime_platform": runtime_platform,
    "linux_dependencies_preserved": True, "public_assets_preserved": True,
    "native_node_modules_copied": False, "generated_files": len(entries),
    "archive_bytes": archive.stat().st_size,
}, indent=2) + "\n", encoding="utf-8")
