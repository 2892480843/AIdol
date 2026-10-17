"""Run one real queue job against a local notification sink, without external delivery."""
import asyncio,json,threading,httpx,importlib.util
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from pathlib import Path
from arq import create_pool
from app.workers.settings import get_redis_settings

messages=[]
class Sink(BaseHTTPRequestHandler):
 def do_POST(self):
  messages.append(self.rfile.read(int(self.headers.get('Content-Length','0'))));self.send_response(200);self.end_headers();self.wfile.write(b'{"id":"verification-job"}')
 def log_message(self,*a):pass
async def main():
 c=httpx.Client(base_url='http://frontend:3000/api/v1',timeout=20)
 email='wardrowbe-schedule-20261017@example.com'
 a=c.post('/auth/sync',json={'external_id':email.replace('@','-'),'email':email,'display_name':'功能验收 owner'});a.raise_for_status();c.headers['Authorization']='Bearer '+a.json()['access_token']
 c.patch('/users/me',json={'locale':'zh-CN','timezone':'Asia/Shanghai','location_lat':30.2741,'location_lon':120.1551}).raise_for_status()
 if c.get('/items').json()['total']==0:
  spec=importlib.util.spec_from_file_location('fixtures','/tmp/wardrowbe-live-check-library.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
  for kind,typ,col in [('shirt','t-shirt','blue'),('pants','pants','black'),('shoes','sneakers','white')]:
   c.post('/items',data={'name':'定时通知验收-'+kind,'type':typ,'primary_color':col,'skip_ai':'true'},files={'image':(kind+'.png',m.fixture(kind),'image/png')}).raise_for_status()
 channels=c.get('/notifications/settings').json()
 if not channels:
  c.post('/notifications/settings',json={'channel':'ntfy','enabled':False,'config':{'server':'http://backend:18991','topic':'wardrobe-verification'}}).raise_for_status()
 schedules=c.get('/notifications/schedules').json()
 if not schedules:
  c.post('/notifications/schedules',json={'day_of_week':0,'notification_time':'10:30','occasion':'casual','enabled':False}).raise_for_status()
 channel=c.get('/notifications/settings').json()[0];schedule=c.get('/notifications/schedules').json()[0]
 assert not schedule['enabled'] and channel['config']['server']=='http://backend:18991'
 server=ThreadingHTTPServer(('0.0.0.0',18991),Sink);threading.Thread(target=server.serve_forever,daemon=True).start()
 pool=await create_pool(get_redis_settings())
 try:
  c.patch('/notifications/settings/'+channel['id'],json={'enabled':True}).raise_for_status()
  job=await pool.enqueue_job('process_scheduled_notification',schedule['id'],_queue_name='arq:tagging')
  result=await job.result(timeout=120,poll_delay=0.2)
  history=c.get('/notifications/history').json()
  success=result.get('status')=='sent' and len(messages)>0 and any(x['status']=='sent' for x in history)
  report={'passed':success,'job_result':result,'sink_messages':len(messages),'notification_history_statuses':[x['status'] for x in history],'schedule_enabled':False,'scope':'real Redis queue -> worker -> AI recommendation -> notification persistence -> local HTTP sink; no external recipient'}
  Path('/tmp/wardrowbe-scheduled-delivery.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
  print(json.dumps(report,ensure_ascii=False),flush=True)
  assert success
 finally:
  c.patch('/notifications/settings/'+channel['id'],json={'enabled':False}).raise_for_status()
  await pool.aclose();server.shutdown();server.server_close();c.close()
asyncio.run(main())
