"""Read-only feasibility audit; public text/metadata only, never model weights or photos."""

from datetime import datetime, timezone
import hashlib
import importlib.util
import json
from pathlib import Path
import platform
import shutil
import subprocess
import sys
import urllib.request

ROOT = Path(__file__).resolve().parent
SOURCES = {
    "triposr-readme": "https://raw.githubusercontent.com/VAST-AI-Research/TripoSR/main/README.md",
    "triposr-run": "https://raw.githubusercontent.com/VAST-AI-Research/TripoSR/main/run.py",
    "triposr-system": "https://raw.githubusercontent.com/VAST-AI-Research/TripoSR/main/tsr/system.py",
    "triposr-config": "https://huggingface.co/stabilityai/TripoSR/raw/main/config.yaml",
    "triposr-metadata": "https://huggingface.co/api/models/stabilityai/TripoSR?blobs=true",
    "sf3d-readme": "https://raw.githubusercontent.com/Stability-AI/stable-fast-3d/main/README.md",
    "sf3d-metadata": "https://huggingface.co/api/models/stabilityai/stable-fast-3d?blobs=true",
    "pshuman-readme": "https://raw.githubusercontent.com/pengHTYX/PSHuman/main/README.md",
    "sith-readme": "https://raw.githubusercontent.com/SiTH-Diffusion/SiTH/main/README.md",
    "sam-body-install": "https://raw.githubusercontent.com/facebookresearch/sam-3d-body/main/INSTALL.md",
    "hunyuan-readme": "https://raw.githubusercontent.com/Tencent-Hunyuan/Hunyuan3D-2/main/README.md",
    "hunyuan-rasterizer": "https://raw.githubusercontent.com/Tencent-Hunyuan/Hunyuan3D-2/main/hy3dgen/texgen/custom_rasterizer/setup.py",
    "hunyuan-swift-readme": "https://raw.githubusercontent.com/ZimengXiong/Hunyuan3D-Swift/main/README.md",
    "modelr-manifest": "https://raw.githubusercontent.com/ZimengXiong/Modelr/main/model_manifest.json",
    "apple-session": "https://developer.apple.com/documentation/realitykit/photogrammetrysession.md",
    "apple-capture": "https://developer.apple.com/documentation/realitykit/capturing-photographs-for-realitykit-object-capture.md",
}


def command(args):
    result = subprocess.run(args, capture_output=True, text=True, timeout=20)
    return {"exit_code": result.returncode, "output": result.stdout.strip()}


def main():
    target = ROOT / "sources"
    target.mkdir(exist_ok=True)
    disk = shutil.disk_usage(ROOT)
    report = {
        "timestamp_utc": datetime.now(timezone.utc).isoformat(),
        "platform": {"system": platform.system(), "release": platform.release(),
                     "machine": platform.machine(), "python": sys.version},
        "disk_free_bytes": disk.free,
        "torch_present_in_audit_interpreter": importlib.util.find_spec("torch") is not None,
        "commands": {name: command(args) for name, args in {
            "physical_memory": ["sysctl", "-n", "hw.memsize"],
            "swap": ["sysctl", "vm.swapusage"],
            "memory_pressure": ["memory_pressure", "-Q"],
            "vm_stat": ["vm_stat"],
            "blender": ["blender", "--version"],
        }.items()},
        "public_sources": [],
        "model_weight_download_bytes": 0,
        "private_photos_read": False,
        "production_configuration_read": False,
        "generation_api_requests": 0,
        "inference_run": False,
        "mesh_produced": False,
    }
    for name, url in SOURCES.items():
        entry = {"name": name, "url": url}
        try:
            with urllib.request.urlopen(url, timeout=30) as response:
                payload = response.read(1_000_001)
                if len(payload) > 1_000_000:
                    raise ValueError("public text source exceeds 1 MB audit limit")
                body = payload.decode("utf-8")
            filename = name + (".json" if name.endswith("metadata") or name.endswith("manifest") else ".txt")
            (target / filename).write_text(body, encoding="utf-8")
            entry.update(bytes=len(payload), sha256=hashlib.sha256(payload).hexdigest(), file="sources/" + filename)
        except Exception as exc:
            # Never serialize response headers, redirected signed URLs, or request objects.
            entry["error_type"] = type(exc).__name__
        report["public_sources"].append(entry)
    (ROOT / "audit.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"evidence": str(ROOT / "audit.json"), "sources_ok": sum("sha256" in x for x in report["public_sources"]), "sources_total": len(SOURCES), "inference_run": False}, ensure_ascii=False))


if __name__ == "__main__":
    main()
