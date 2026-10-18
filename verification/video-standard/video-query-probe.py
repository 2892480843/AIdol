import asyncio,json
from pathlib import Path
import httpx
from app.config import get_settings
async def main():
 s=get_settings()
 async with httpx.AsyncClient(timeout=30,follow_redirects=False) as c:
  r=await c.get(s.ai_base_url.rstrip('/')+'/contents/generations/tasks',headers={'Authorization':'Bearer '+s.ai_api_key})
  try: v=r.json()
  except ValueError: print(json.dumps({'http_status':r.status_code,'json':False})); return
  p=Path('/tmp/dada-video-list-response.json');p.write_text(json.dumps(v));p.chmod(0o600)
  safe={'http_status':r.status_code,'keys':list(v) if isinstance(v,dict) else type(v).__name__}
  if isinstance(v,dict):
   safe['envelope']={k:str(v[k])[:500].replace(s.ai_api_key,'[redacted]') for k in ['code','msg','message','status','error'] if k in v}
   for key in ['data','items','tasks']:
    value=v.get(key)
    if isinstance(value,dict): safe[key+'_keys']=list(value)
    elif isinstance(value,list):safe[key+'_tasks']=[{k:q.get(k) for k in ['id','task_id','model','status','created_at']} for q in value if isinstance(q,dict)][:10]
  print(json.dumps(safe,ensure_ascii=False))
asyncio.run(main())
