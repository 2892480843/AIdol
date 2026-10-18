"""Run current backend tests with disposable, network-isolated PostgreSQL and Redis.

Production container inspection is limited to immutable image IDs. No production
environment, storage volume, database, Redis instance, or model key is reused.
"""

from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import platform
import subprocess
import sys
import time
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[3]
EVIDENCE = Path(__file__).resolve().parent
DOCKER = "/Applications/Docker.app/Contents/Resources/bin/docker"
RUN_ID = f"dada-full-test-{os.getpid()}"
NETWORK = f"{RUN_ID}-network"
POSTGRES = f"{RUN_ID}-postgres"
REDIS = f"{RUN_ID}-redis"
TESTER = f"{RUN_ID}-runner"
SUFFIX = sys.argv[1] if len(sys.argv) > 1 else "full"
TEST_PATHS = sys.argv[2:] if len(sys.argv) > 2 else ["tests"]


def docker(*args: str, **kwargs):
    return subprocess.run([DOCKER, *args], check=True, **kwargs)


def image_of(container: str) -> str:
    return subprocess.check_output(
        [DOCKER, "inspect", "--format", "{{.Image}}", container], text=True
    ).strip()


def snapshot() -> str:
    values = {}
    for path in sorted((ROOT / "backend").rglob("*")):
        if not path.is_file() or any(
            part in {"__pycache__", ".pytest_cache", ".ruff_cache", ".venv", ".git"}
            for part in path.parts
        ):
            continue
        if path.name.startswith(".env"):
            continue
        values[str(path.relative_to(ROOT))] = hashlib.sha256(path.read_bytes()).hexdigest()
    encoded = json.dumps(values, sort_keys=True).encode()
    (EVIDENCE / f"source-manifest-{SUFFIX}.json").write_text(
        json.dumps(values, indent=2) + "\n", encoding="utf-8"
    )
    return hashlib.sha256(encoded).hexdigest()


def wait_ready(container: str, *args: str):
    for _ in range(50):
        result = subprocess.run(
            [DOCKER, "exec", container, *args],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        if result.returncode == 0:
            return
        time.sleep(0.2)
    raise RuntimeError(f"Isolated fixture did not become ready: {container}")


EVIDENCE.mkdir(parents=True, exist_ok=True)
images = {
    "backend": image_of("wardrobe-backend"),
    "postgres": image_of("wardrobe-db"),
    "redis": image_of("wardrobe-redis"),
}
metadata = {
    "host": {"system": platform.system(), "machine": platform.machine()},
    "images": images,
    "isolation": {
        "network_internal": True,
        "production_data_volumes": False,
        "production_credentials": False,
        "postgres_storage": "temporary memory filesystem",
        "redis_storage": "disposable container filesystem",
        "external_ai_calls": "blocked by internal Docker network and loopback test endpoint",
    },
    "paths": TEST_PATHS,
    "source_manifest_sha256": snapshot(),
}
started = time.monotonic()
exit_code = 1
try:
    docker("network", "create", "--internal", NETWORK, stdout=subprocess.DEVNULL)
    docker(
        "run", "--detach", "--name", POSTGRES, "--network", NETWORK,
        "--tmpfs", "/var/lib/postgresql:rw", "-e", "POSTGRES_USER=unit",
        "-e", "POSTGRES_PASSWORD=unit-isolated-test-only", "-e", "POSTGRES_DB=postgres",
        images["postgres"], stdout=subprocess.DEVNULL,
    )
    docker(
        "run", "--detach", "--name", REDIS, "--network", NETWORK,
        images["redis"], "redis-server", "--save", "", "--appendonly", "no",
        stdout=subprocess.DEVNULL,
    )
    wait_ready(POSTGRES, "pg_isready", "-U", "unit", "-d", "postgres")
    wait_ready(REDIS, "redis-cli", "ping")
    url = (
        f"postgresql+asyncpg://unit:unit-isolated-test-only@{POSTGRES}:5432/"
        "dada_full_function_test"
    )
    test_env = {
        "TEST_DATABASE_URL": url,
        "DATABASE_URL": url,
        "REDIS_URL": f"redis://{REDIS}:6379/0",
        "STORAGE_PATH": "/tmp/dada-full-function-test-storage",
        "AI_BASE_URL": "http://127.0.0.1:9/v1",
        "AI_API_KEY": "test-no-external-model",
        "PYTHONDONTWRITEBYTECODE": "1",
    }
    args = [
        DOCKER, "run", "--rm", "--name", TESTER, "--network", NETWORK,
        "--entrypoint", "python", "-w", "/workspace/backend",
        "-v", f"{ROOT}:/workspace:ro", "-v", f"{EVIDENCE}:/evidence",
    ]
    for name in test_env:
        args.extend(["-e", name])
    args.extend([
        images["backend"], "-m", "pytest", *TEST_PATHS,
        "-o", "cache_dir=/tmp/pytest-cache", "-q",
        f"--junitxml=/evidence/backend-{SUFFIX}.xml",
    ])
    with (EVIDENCE / f"backend-{SUFFIX}.log").open("w", encoding="utf-8") as log:
        result = subprocess.run(
            args, env={**os.environ, **test_env}, stdout=log, stderr=subprocess.STDOUT
        )
    exit_code = result.returncode
    metadata["exit_code"] = exit_code
    metadata["elapsed_seconds"] = round(time.monotonic() - started, 3)
    junit = EVIDENCE / f"backend-{SUFFIX}.xml"
    if junit.exists():
        suites = ET.parse(junit).getroot()
        names = ["tests", "failures", "errors", "skipped"]
        metadata["result"] = {
            name: sum(int(suite.attrib.get(name, 0)) for suite in suites.findall("testsuite"))
            for name in names
        }
    print(json.dumps(metadata, indent=2))
finally:
    for container in [TESTER, REDIS, POSTGRES]:
        subprocess.run(
            [DOCKER, "rm", "--force", "--volumes", container],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
    subprocess.run(
        [DOCKER, "network", "rm", NETWORK],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    metadata["fixtures_removed"] = True
    (EVIDENCE / f"run-{SUFFIX}.json").write_text(
        json.dumps(metadata, indent=2) + "\n", encoding="utf-8"
    )

sys.exit(exit_code)
