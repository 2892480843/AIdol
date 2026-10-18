"""Reproducible real-model probe against frozen, licensed synthetic renders."""
import base64, hashlib, importlib.util, json, os, sys, time
from pathlib import Path
from PIL import Image, ImageDraw

work=Path(__file__).resolve().parent
repo=work.parents[2]
spec=importlib.util.spec_from_file_location('extraction_probe_service',repo/'backend/app/services/clothing_extraction.py')
service=importlib.util.module_from_spec(spec);spec.loader.exec_module(service)
os.environ['CLOTHING_EXTRACTION_MODEL_PATH']=str(work/'model/schp-atr-18-int8-static.onnx')
results=[]
for source in sorted((work/'inputs').glob('*.png')):
    start=time.monotonic()
    response=service.extract_clothing(source.read_bytes())
    elapsed=time.monotonic()-start
    out=work/'verified'/source.stem;out.mkdir(parents=True,exist_ok=True)
    canvas=Image.new('RGB',(1200,600),'#e4edf0')
    draw=ImageDraw.Draw(canvas)
    original=Image.open(source);original.thumbnail((320,540));canvas.paste(original,(10,40));draw.text((10,10),source.stem,fill='black')
    for i,piece in enumerate(response['pieces']):
        data=base64.b64decode(piece['thumbnail_data_url'].split(',')[1]);(out/f"{piece['type']}.png").write_bytes(data)
        image=Image.open(out/f"{piece['type']}.png");image.thumbnail((230,470))
        canvas.paste(image,(340+i*270,60),image)
        draw.text((340+i*270,15),f"{piece['type']} / {piece['confidence']}",fill='black')
        piece.pop('thumbnail_data_url')
        piece['png_bytes']=len(data)
    canvas.save(out/'review.jpg')
    response.update(source=source.name,source_sha256=hashlib.sha256(source.read_bytes()).hexdigest(),seconds=round(elapsed,3))
    results.append(response);print(source.name,[(p['type'],p['confidence']) for p in response['pieces']],round(elapsed,2),flush=True)
(work/'verified-results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2))
