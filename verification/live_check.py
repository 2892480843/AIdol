"""Exercise the deployed app with isolated synthetic users and clothing fixtures."""
import io,json,time,uuid,threading
from datetime import datetime
from pathlib import Path
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
import httpx
from PIL import Image,ImageDraw

BASE='http://frontend:3000/api/v1'
ORIGIN='http://frontend:3000'
report={'started_at':datetime.now().isoformat(),'scope':'deployed frontend proxy, API, database, Redis workers and real AI; synthetic data only','checks':[]}
report_path=Path('/tmp/wardrowbe-live-check.json')
client=httpx.Client(base_url=BASE,timeout=150)
state={}

def save():report_path.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
def req(method,path,expected=(200,),**kwargs):
 r=client.request(method,path,**kwargs)
 if r.status_code not in expected:raise AssertionError(f'{method} {path}: HTTP {r.status_code}: {r.text[:500]}')
 return r.json() if r.content and 'json' in r.headers.get('content-type','') else r

def check(name,fn):
 start=time.monotonic()
 try:
  detail=fn();entry={'name':name,'passed':True,'detail':detail}
 except Exception as e:entry={'name':name,'passed':False,'error':f'{type(e).__name__}: {e}'}
 entry['seconds']=round(time.monotonic()-start,2);report['checks']=[x for x in report['checks'] if x['name']!=name]+[entry];save()
 print(json.dumps(entry,ensure_ascii=False),flush=True)
 return entry['passed']

def login(label):
 email=f'wardrowbe-verify-{label}-{state["run"]}@example.com'
 return req('POST','/auth/sync',json={'external_id':email.replace('@','-'),'email':email,'display_name':f'功能验收 {label}'})

def fixture(kind):
 im=Image.new('RGB',(400,400),'#eeeeee');d=ImageDraw.Draw(im)
 if kind=='shirt':
  d.polygon([(140,70),(70,115),(90,180),(120,165),(120,330),(280,330),(280,165),(310,180),(330,115),(260,70),(235,95),(165,95)],fill='#2368ce',outline='#194182',width=3)
 elif kind=='pants':
  d.polygon([(135,55),(265,55),(285,340),(220,340),(200,180),(180,340),(115,340)],fill='#222222',outline='black',width=3);d.line([(135,85),(267,85)],fill='#777777',width=3)
 elif kind=='shoes':
  for y in (130,245):
   d.polygon([(80,y),(170,y-25),(220,y+20),(315,y+30),(330,y+65),(80,y+65)],fill='white',outline='#555555',width=4)
   for k in range(4):d.line([(160+k*12,y),(190+k*12,y+25)],fill='#333333',width=3)
 else:
  d.rectangle((115,50,285,350),fill='#c54439');d.line((200,50,200,350),fill='white',width=4)
 buf=io.BytesIO();im.save(buf,format='PNG');return buf.getvalue()

def seed():
 state['run']=uuid.uuid4().hex[:8]
 a=login('owner');state['user_id']=a['id'];state['email']=a['email'];state['token']=a['access_token']
 client.headers['Authorization']='Bearer '+state['token']
 req('PATCH','/users/me',json={'locale':'zh-CN','timezone':'Asia/Shanghai','location_lat':30.2741,'location_lon':120.1551,'location_name':'杭州（验收测试）'})
 req('POST','/users/me/onboarding/complete')
 for kind,typ,col in [('shirt','t-shirt','blue'),('pants','pants','black'),('shoes','sneakers','white')]:
  data={'name':'验收样例-'+kind,'skip_ai':'false' if kind=='shirt' else 'true'}
  if kind!='shirt':data.update({'type':typ,'primary_color':col,'colors':col})
  item=req('POST','/items',expected=(201,),data=data,files={'image':(kind+'.png',fixture(kind),'image/png')})
  state[kind]=item['id']
 report['test_account']={'email':state['email'],'user_id':state['user_id']}
 return {'created_items':3,'test_account':state['email']}

def ai_queue():
 deadline=time.monotonic()+240
 while time.monotonic()<deadline:
  item=req('GET','/items/'+state['shirt'])
  if item['status']!='processing' and item['ai_processed']:
   assert item['type']=='t-shirt' and item['primary_color']=='blue',item
   return {k:item.get(k) for k in ('type','primary_color','status','tagging_status','ai_description')}
  if item.get('ai_error'):raise AssertionError(item['ai_error'])
  time.sleep(2)
 raise AssertionError('AI queue did not complete within 240 seconds')

def image_url():
 item=req('GET','/items/'+state['shirt']);url=item['image_url']
 assert url.startswith('/api/v1/images/'),url
 r=client.get(ORIGIN+url);assert r.status_code==200 and r.headers['content-type'].startswith('image/')
 return {'image_bytes':len(r.content),'type':r.headers['content-type']}

def management():
 item=req('PATCH','/items/'+state['pants'],json={'favorite':True,'notes':'synthetic acceptance fixture','tags':{'size':'M','care_instructions':'machine wash'}})
 assert item['favorite'] and item['tags']['size']=='M'
 items=req('GET','/items',params={'search':'验收','type':'pants'});assert any(x['id']==state['pants'] for x in items['items'])
 a=req('POST','/items/'+state['pants']+'/archive',json={'reason':'verification'});assert a['is_archived']
 a=req('POST','/items/'+state['pants']+'/restore');assert not a['is_archived']
 return 'edit, search, filter, archive and restore passed'

def wear_wash():
 i=req('POST','/items/'+state['pants']+'/wear',json={'occasion':'casual','notes':'验收记录'});assert i['wear_count']>=1
 req('GET','/items/'+state['pants']+'/history')
 req('GET','/items/'+state['pants']+'/wear-stats')
 i=req('POST','/items/'+state['pants']+'/wash',json={'method':'machine'});assert i['wears_since_wash']==0
 hist=req('GET','/items/'+state['pants']+'/wash-history');assert len(hist)>=1
 return 'wear count, history, wash reset and wash history passed'

def rotation():
 req('POST','/items/'+state['shirt']+'/rotate',params={'direction':'cw'})
 req('POST','/items/'+state['shirt']+'/rotate',params={'direction':'ccw'})
 return 'clockwise/counterclockwise rotations passed'

def background():
 i=req('POST','/items/'+state['shirt']+'/remove-background',json={'bg_color':'#FFFFFF'})
 end=time.monotonic()+180
 while time.monotonic()<end:
  i=req('GET','/items/'+state['shirt'])
  if i['status']!='processing':
   assert i.get('original_image_path'),i.get('ai_error')
   req('POST','/items/'+state['shirt']+'/restore-original')
   return 'image worker completed background removal and original restore'
  time.sleep(2)
 raise AssertionError('background removal timed out')

def preferences():
 p=req('PATCH','/users/me/preferences',json={'color_favorites':['blue','white'],'default_occasion':'casual','avoid_repeat_days':0})
 assert p['color_favorites']==['blue','white']
 req('POST','/users/me/preferences/excluded-items/'+state['shoes'])
 req('DELETE','/users/me/preferences/excluded-items/'+state['shoes'])
 return 'preferences and recommendation exclusions saved'

def studio():
 o=req('POST','/outfits/studio',expected=(201,),json={'items':[state['shirt'],state['pants'],state['shoes']],'occasion':'casual','name':'验收穿搭','mark_worn':False})
 state['outfit']=o['id'];assert len(o['items'])==3
 req('PATCH','/outfits/'+o['id'],json={'name':'验收穿搭-已编辑'})
 worn=req('POST','/outfits/'+o['id']+'/wear-today',json={});state['outfit']=worn['id'];o=worn
 req('POST','/outfits/'+o['id']+'/feedback',json={'rating':4,'comfort_rating':4,'style_rating':4,'comment':'验收反馈','actually_worn':True})
 f=req('GET','/outfits/'+o['id']+'/feedback');assert f['rating']==4
 return 'manual outfit create/edit, wear-today and feedback passed'

def suggestions():
 o=req('POST','/outfits/suggest',json={'occasion':'casual','weather_override':{'temperature':22,'condition':'sunny','precipitation_chance':0}})
 assert len(o['items'])>=2 and o.get('reasoning'),o
 state['suggestion']=o['id']
 req('POST','/outfits/'+o['id']+'/accept')
 return {'item_count':len(o['items']),'reasoning':o['reasoning'][:180]}

def options():
 o=req('POST','/outfits/suggest-options',json={'occasion':'casual','weather_override':{'temperature':22,'condition':'sunny'}})
 assert len(o)>0 and all(x['items'] for x in o)
 req('POST','/outfits/'+o[0]['id']+'/reject')
 return {'options':len(o),'reject_test':True}

def pairings():
 req('POST','/pairings/item/'+state['shirt'],expected=(201,),json={'items':[state['pants'],state['shoes']],'reasoning':'验收手动搭配'})
 r=req('POST','/pairings/generate/'+state['shirt'],json={'num_pairings':1})
 assert r['generated']>=1,r
 req('GET','/pairings/item/'+state['shirt']);req('GET','/pairings')
 return {'ai_generated':r['generated']}

def statistics():
 a=req('GET','/analytics');assert a['wardrobe']['total_items']>=3 and a['wardrobe']['total_wears']>=1
 req('GET','/outfits');req('GET','/learning');req('POST','/learning/recompute');req('POST','/learning/generate-insights')
 return {'wardrobe':a['wardrobe']}

def family():
 f=req('GET','/families/me',expected=(200,404))
 if 'id' not in f:f=req('POST','/families',expected=(201,),json={'name':'功能验收家庭'})
 second=login('member');token=second['access_token']
 h={'Authorization':'Bearer '+token}
 profile=req('GET','/users/me',headers=h)
 if profile.get('family_id')!=f['id']:req('POST','/families/join',headers=h,json={'invite_code':f['invite_code']})
 members=req('GET','/families/me');assert len(members['members'])==2
 req('GET','/items/'+state['shirt'],headers=h,expected=(404,))
 req('POST','/outfits/'+state['outfit']+'/family-rating',headers=h,json={'rating':4,'comment':'验收家庭评分'})
 ratings=req('GET','/outfits/'+state['outfit']+'/family-ratings');assert len(ratings)>=1
 req('POST','/families/me/leave',headers=h)
 return 'create, join, member isolation, family rating and leave passed'

sink_messages=[]
class Sink(BaseHTTPRequestHandler):
 def do_POST(self):
  sink_messages.append(self.rfile.read(int(self.headers.get('Content-Length','0'))));self.send_response(200);self.end_headers();self.wfile.write(b'{"id":"verification"}')
 def log_message(self,*a):pass

def notifications():
 server=ThreadingHTTPServer(('0.0.0.0',18991),Sink);threading.Thread(target=server.serve_forever,daemon=True).start()
 try:
  s=req('POST','/notifications/settings',expected=(201,),json={'channel':'ntfy','enabled':True,'config':{'server':'http://backend:18991','topic':'wardrobe-verification'}})
  r=req('POST','/notifications/settings/'+s['id']+'/test');assert r['success'] and sink_messages,r
  req('PATCH','/notifications/settings/'+s['id'],json={'enabled':False})
  schedule=req('POST','/notifications/schedules',expected=(201,),json={'day_of_week':0,'notification_time':'09:00','occasion':'casual','enabled':False})
  req('PATCH','/notifications/schedules/'+schedule['id'],json={'notification_time':'10:30'})
  req('GET','/notifications/schedules');req('GET','/notifications/history')
  return 'local ntfy delivery plus disabled channel/schedule CRUD passed; no external recipient'
 finally:server.shutdown();server.server_close()

def weather():
 c=req('GET','/weather/current');f=req('GET','/weather/forecast');assert 'temperature' in c and f['forecast']
 return {'condition':c['condition'],'temperature':c['temperature'],'forecast_days':len(f['forecast'])}

if __name__ == '__main__':
 check('Unauthenticated access is refused',lambda: req('GET','/items',expected=(401,)).get('detail'))
 if check('Test account/profile/onboarding and 3 uploads',seed):
  for name,fn in [('AI image upload queue',ai_queue),('Signed image via frontend proxy',image_url),('Wardrobe management',management),('Wear and wash tracking',wear_wash),('Image rotation',rotation),('Background removal and undo',background),('Preferences and exclusions',preferences),('Manual outfit and feedback',studio),('Real AI recommendation',suggestions),('Multiple recommendations and reject',options),('Manual and AI pairings',pairings),('Analytics, history and learning',statistics),('Family and access isolation',family),('Notification and schedules',notifications),('Real weather and forecast',weather)]:check(name,fn)
 report['passed']=sum(x['passed'] for x in report['checks']);report['failed']=len(report['checks'])-report['passed'];save()
 print(json.dumps({'passed':report['passed'],'failed':report['failed'],'report':str(report_path)}),flush=True)
 raise SystemExit(bool(report['failed']))
