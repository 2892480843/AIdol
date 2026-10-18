"""Build the Next application and byte-verified public assets into one release."""
from pathlib import Path
import gzip
import hashlib
import io
import json
import os
import subprocess
import sys
import tarfile

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
DOCKER = "/Applications/Docker.app/Contents/Resources/bin/docker"
ENV = {**os.environ, "PATH": str(Path(DOCKER).parent) + ":" + os.environ.get("PATH", "")}
BASE = "wardrowbe-frontend:weather-location-20261018-r1-base"
IMAGE = "wardrowbe-frontend:weather-location-20261018-r1"


def run(args):
    subprocess.run(args, cwd=ROOT, env=ENV, check=True)


run([sys.executable, "verification/video-quality/release.py", "snapshot", "--output-dir", str(HERE)])
manifest_hash = hashlib.sha256((HERE / "frontend-manifest.json").read_bytes()).hexdigest()
label = "com.dada.source-manifest-sha256=" + manifest_hash
run([DOCKER, "build", "--pull=false", "--label", label, "-t", BASE, "-f", str(HERE / "Dockerfile.cached"), "frontend"])

release = HERE / "release"
release.mkdir(exist_ok=True)
public = ROOT / "frontend/public"
files = sorted(p for p in public.rglob("*") if p.is_file())
# No public assets changed in this lossless loading optimization; reuse the already byte-verified archive.
previous = ROOT / "verification/dopamine-avatar/release"
import shutil
for part in sorted(previous.glob("public-assets.part-*")):
    shutil.copy2(part, release / part.name)
payload_size = sum(part.stat().st_size for part in release.glob("public-assets.part-*"))
checksums = "".join(hashlib.sha256(p.read_bytes()).hexdigest() + "  public/" + str(p.relative_to(public)) + "\n" for p in files)
assert checksums == (previous / "public-assets.sha256").read_text(), "Cached public assets differ"
(release / "public-assets.sha256").write_text(checksums, encoding="utf-8")
(release / "Dockerfile").write_text(f"FROM {BASE}\nUSER root\nCOPY public-assets.part-* public-assets.sha256 /tmp/dada-public/\nRUN cat /tmp/dada-public/public-assets.part-* | tar -xz -C public && sha256sum -c /tmp/dada-public/public-assets.sha256 && rm -rf /tmp/dada-public\n", encoding="utf-8")
run([DOCKER, "build", "--pull=false", "--label", label, "-t", IMAGE, str(release)])
image_id = subprocess.check_output([DOCKER, "image", "inspect", "--format", "{{.Id}}", IMAGE], env=ENV, text=True).strip()
(HERE / "build.json").write_text(json.dumps({"base": BASE, "image": IMAGE, "image_id": image_id, "manifest_sha256": manifest_hash, "public_files": len(files), "public_archive_bytes": payload_size}, indent=2) + "\n")
