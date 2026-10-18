"""One-shot provider experiment using our fictional adult reference; never auto-resubmit."""
import asyncio,base64,json,sys,uuid
from pathlib import Path
import httpx
from app.config import get_settings

state_path=Path('/tmp/dada-video-standard-probe.json')
async def main():
 s=get_settings()
 headers={'Authorization':'Bearer '+s.ai_api_key,'Content-Type':'application/json'}
 async with httpx.AsyncClient(timeout=90,follow_redirects=False) as client:
  if sys.argv[1]=='create':
   if state_path.exists():
    print(json.dumps({'already_attempted':True,**json.loads(state_path.read_text())}));return
   intent={'key':str(uuid.uuid4()),'state':'submitting'}
   state_path.write_text(json.dumps(intent));state_path.chmod(0o600)
   data_url='data:image/png;base64,'+base64.b64encode(Path('/tmp/dada-video-reference.png').read_bytes()).decode()
   payload={'model':'Doubao-Seedance-1.0-pro','content':[{'type':'text','text':'A high-end photoreal fashion lookbook. The same adult fictional woman from the reference, in the exact pink ribbed cardigan, mint pleated skirt, white sneakers and long brown hair, makes ONE complete 360 degree turn in place and returns to the exact front-facing pose. Full body visible head to shoes throughout. Fixed camera, no cuts, no zoom, neutral light grey seamless studio, soft natural shadows. Preserve her face and identity, body proportions, hairstyle, colors, garment seams and pleats consistently. Smooth human anatomy and hands. No outfit transformation, no extra people, no text.'},{'type':'image_url','image_url':{'url':data_url}}],'ratio':'adaptive','duration':5,'resolution':'480p','watermark':False}
   try:
    r=await client.post(s.ai_base_url.rstrip('/')+'/contents/generations/tasks',json=payload,headers={**headers,'Idempotency-Key':intent['key']})
    try: result=r.json()
    except ValueError: result={}
    raw=Path('/tmp/dada-video-create-response.json');raw.write_text(json.dumps(result));raw.chmod(0o600)
    task_id=result.get('id')
    safe={'key':intent['key'],'state':'accepted' if r.is_success and task_id else 'unknown' if r.is_success else 'rejected','http_status':r.status_code,'task_id':task_id,'error':str(result.get('error',result.get('message','')))[:800].replace(s.ai_api_key,'[redacted]')}
    state_path.write_text(json.dumps(safe));print(json.dumps(safe))
   except httpx.HTTPError as exc:
    safe={**intent,'state':'unknown','error':type(exc).__name__};state_path.write_text(json.dumps(safe));print(json.dumps(safe))
  else:
   intent=json.loads(state_path.read_text());task_id=intent.get('task_id')
   if not task_id: print(json.dumps(intent));return
   r=await client.get(s.ai_base_url.rstrip('/')+'/contents/generations/tasks/'+task_id,headers=headers)
   result=r.json();safe={'http_status':r.status_code,'task_id':task_id,'status':result.get('status'),'error':str(result.get('error',''))[:800].replace(s.ai_api_key,'[redacted]'),'resolution':result.get('resolution'),'duration':result.get('duration')}
   if r.is_success:
    Path('/tmp/dada-video-standard-result.json').write_text(json.dumps(result));Path('/tmp/dada-video-standard-result.json').chmod(0o600)
    safe['has_video_url']=bool((result.get('content') or {}).get('video_url'))
   print(json.dumps(safe))
asyncio.run(main())
