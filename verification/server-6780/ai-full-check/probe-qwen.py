import base64,subprocess,json,urllib.request,urllib.error,datetime
from pathlib import Path
pid=subprocess.check_output(['systemctl','show','dada-6780@api','--property=MainPID','--value'],text=True).strip()
env=dict(x.split('=',1) for x in Path('/proc/'+pid+'/environ').read_bytes().decode().split('\0') if '=' in x)
image=Path('/opt/dada-6780/ai-verification-20261018/extracted-top.png').read_bytes()
payload={'model':'qwen-image-2.1-pro','prompt':'Remove only the background from this clothing photograph. Preserve the garment, its outline, color, texture and all details. Output a transparent PNG image with a real alpha channel. Do not draw a checkerboard or add any objects.','image':['data:image/png;base64,'+base64.b64encode(image).decode()],'size':'1024x1024','n':1,'response_format':'b64_json'}
req=urllib.request.Request(env['AI_BASE_URL'].rstrip('/')+'/images/generations',data=json.dumps(payload).encode(),headers={'Authorization':'Bearer '+env['AI_API_KEY'],'Content-Type':'application/json'})
out={'checked_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'model':payload['model']}
try:
 with urllib.request.urlopen(req,timeout=150) as res:
  raw=res.read(); data=json.loads(raw); out['http_status']=res.status; out['response_keys']=list(data)
  images=data.get('data',[])
  if images and images[0].get('b64_json'):
   from PIL import Image
   import io
   imgdata=base64.b64decode(images[0]['b64_json']); Path('/opt/dada-6780/ai-verification-20261018/qwen-background.png').write_bytes(imgdata)
   with Image.open(io.BytesIO(imgdata)) as im:out['image']={'mode':im.mode,'format':im.format,'size':list(im.size),'alpha_extrema':list(im.getchannel('A').getextrema()) if 'A' in im.getbands() else None}
  elif images:out['image_url_returned']=bool(images[0].get('url'))
except urllib.error.HTTPError as e:
 out['http_status']=e.code; out['error']=e.read(1200).decode(errors='replace').replace(env['AI_API_KEY'],'[REDACTED]')
except Exception as e:out['error_type']=type(e).__name__
Path('/opt/dada-6780/ai-verification-20261018/qwen-api-probe.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(out,ensure_ascii=False,indent=2))
