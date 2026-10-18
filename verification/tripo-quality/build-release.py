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
BASE = "wardrowbe-frontend:tripo-quality-20261018-base"
IMAGE = "wardrowbe-frontend:tripo-quality-20261018"


def run(args):
    subprocess.run(args, cwd=ROOT, env=ENV, check=True)


run([sys.executable, "verification/video-quality/release.py", "snapshot", "--output-dir", str(HERE)])
manifest_hash = hashlib.sha256((HERE / "frontend-manifest.json").read_bytes()).hexdigest()
label = "com.dada.source-manifest-sha256=" + manifest_hash
run([DOCKER, "build", "--pull=false", "--label", label, "-t", BASE, "frontend"])

release = HERE / "release"
release.mkdir(exist_ok=True)
public = ROOT / "frontend/public"
files = sorted(p for p in public.rglob("*") if p.is_file())
archive = io.BytesIO()
with gzip.GzipFile(fileobj=archive, mode="wb", mtime=0) as compressed:
    with tarfile.open(fileobj=compressed, mode="w|") as tar:
        for file in files:
            if file.is_symlink():
                raise ValueError("Public assets must be ordinary files")
            info = tar.gettarinfo(str(file), str(file.relative_to(public)))
            info.uid = info.gid = 0
            info.uname = info.gname = ""
            info.mtime = 0
            with file.open("rb") as stream:
                tar.addfile(info, stream)
payload = archive.getvalue()
for index, offset in enumerate(range(0, len(payload), 8 * 1024 * 1024)):
    (release / f"public-assets.part-{index:03d}").write_bytes(payload[offset:offset + 8 * 1024 * 1024])
checksums = "".join(hashlib.sha256(p.read_bytes()).hexdigest() + "  public/" + str(p.relative_to(public)) + "\n" for p in files)
(release / "public-assets.sha256").write_text(checksums, encoding="utf-8")
(release / "Dockerfile").write_text(f"FROM {BASE}\nUSER root\nCOPY public-assets.part-* public-assets.sha256 /tmp/dada-public/\nRUN cat /tmp/dada-public/public-assets.part-* | tar -xz -C public && sha256sum -c /tmp/dada-public/public-assets.sha256 && rm -rf /tmp/dada-public\n", encoding="utf-8")
run([DOCKER, "build", "--pull=false", "--label", label, "-t", IMAGE, str(release)])
image_id = subprocess.check_output([DOCKER, "image", "inspect", "--format", "{{.Id}}", IMAGE], env=ENV, text=True).strip()
(HERE / "build.json").write_text(json.dumps({"base": BASE, "image": IMAGE, "image_id": image_id, "manifest_sha256": manifest_hash, "public_files": len(files), "public_archive_bytes": len(payload)}, indent=2) + "\n")
