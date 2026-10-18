"""Single bounded Linux ARM64 local-only extraction with phase evidence."""
import base64
import hashlib
import json
from pathlib import Path
import subprocess
import time

work = Path(__file__).resolve().parent
out = work.parent / "production-extraction"
out.mkdir(exist_ok=True)
program = '''import time,json,platform,hashlib
from pathlib import Path
start=time.monotonic()
def stage(name,**extra): print("STAGE "+json.dumps({"stage":name,"seconds":round(time.monotonic()-start,3),**extra}),flush=True)
stage("python_started",platform=platform.machine())
from app.services.clothing_extraction import capabilities,extract_clothing
stage("service_imported")
content=Path("/tmp/dada-extraction-cc0-fixture.png").read_bytes()
stage("fixture_read",bytes=len(content),sha256=hashlib.sha256(content).hexdigest())
t=time.monotonic()
r=extract_clothing(content)
stage("extraction_returned",seconds_in_extract=round(time.monotonic()-t,3))
r["verification"]={"platform":platform.machine(),"seconds":round(time.monotonic()-t,3),"capabilities":capabilities()}
r["source_sha256"]=hashlib.sha256(content).hexdigest()
print("RESULT_JSON "+json.dumps(r),flush=True)
'''
started = time.monotonic()
try:
    run = subprocess.run(
        ["/Applications/Docker.app/Contents/Resources/bin/docker", "exec", "wardrobe-backend",
         "timeout", "--kill-after=5", "75", "python", "-u", "-c", program],
        capture_output=True, text=True, timeout=90,
    )
    lines = run.stdout.splitlines()
    evidence = {"returncode":run.returncode,"seconds":round(time.monotonic()-started,3),
                "stages":[json.loads(line.removeprefix("STAGE ")) for line in lines if line.startswith("STAGE ")],
                "stderr":run.stderr[-3000:]}
    (work / "production-service-diagnostic.json").write_text(json.dumps(evidence,indent=2))
    print(json.dumps(evidence,indent=2),flush=True)
    if run.returncode:
        raise SystemExit(run.returncode)
    result = json.loads(next(line.removeprefix("RESULT_JSON ") for line in lines if line.startswith("RESULT_JSON ")))
    for piece in result["pieces"]:
        png=base64.b64decode(piece.pop("thumbnail_data_url").split(",",1)[1])
        (out / f"{piece['type']}.png").write_bytes(png)
        piece["png_sha256"]=hashlib.sha256(png).hexdigest()
    result["wall_seconds"]=round(time.monotonic()-started,3)
    (out / "result.json").write_text(json.dumps(result,ensure_ascii=False,indent=2))
    print(json.dumps(result,ensure_ascii=False,indent=2),flush=True)
except subprocess.TimeoutExpired as error:
    (work / "production-service-diagnostic-timeout.log").write_text(str(error.stdout)+"\n"+str(error.stderr))
    raise
