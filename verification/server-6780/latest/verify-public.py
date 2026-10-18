import json,base64,http.cookiejar,urllib.request,urllib.parse,urllib.error,re,hashlib
from pathlib import Path
from datetime import datetime,timezone
c=json.load(open('/etc/dada-6780/credentials.json'));base='https://124.70.96.183:6780';basic='Basic '+base64.b64encode((c['user']+':'+c['password']).encode()).decode();opener=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
def req(path,method='GET',body=None,auth=None):
 headers={}
 if auth:headers['Authorization']=auth
 if body is not None:headers['Content-Type']='application/x-www-form-urlencoded'
 try:
  with opener.open(urllib.request.Request(base+path,data=body,headers=headers,method=method),timeout=60) as res:return res.read()
 except urllib.error.HTTPError as e:
  if e.code==308: print('redirect_diagnostic',path,e.headers.get('Location'))
  raise
def denied(path):
 try:req(path)
 except urllib.error.HTTPError as e:assert e.code==401;return
 raise AssertionError('Unauthenticated access allowed')
report={'checked_at':datetime.now(timezone.utc).isoformat(),'url':base,'checks':[]}
denied('/dashboard');denied('/api/v1/items');report['checks'].append('unauthenticated private routes denied')
assert json.loads(req('/api/v1/health/ready'))['status']=='healthy'
csrf=json.loads(req('/api/auth/csrf',auth=basic))['csrfToken']
req('/api/auth/callback/forward-auth','POST',urllib.parse.urlencode({'csrfToken':csrf,'callbackUrl':base+'/dashboard','json':'true'}).encode(),basic)
session=json.loads(req('/api/auth/session',auth=basic));token=session.get('accessToken');assert token and not session.get('syncError');report['checks'].append('public login and API identity')
items=json.loads(req('/api/v1/items',auth='Bearer '+token));assert items['total']>=3
report['inventory_count']=items['total']
for item in items['items']:
 assert len(req(item['thumbnail_url'],auth='Bearer '+token))>100
report['checks'].append('existing inventory and signed thumbnails preserved')
report['pages']={};assets=set()
for path in ['/dashboard','/dashboard/wardrobe','/dashboard/suggest','/dashboard/wardrobe/avatar','/dashboard/wardrobe/tryon','/dashboard/looks']:
 html=req(path,auth=basic).decode();assert len(html)>1000;report['pages'][path]=len(html)
 assets.update(re.findall(r'(?:src|href)="([^" ]+/_next/[^" ]+|/_next/[^" ]+)"',html))
report['checks'].append('six authenticated production pages')
css=[]
for path in sorted(assets):
 if not path.startswith('/_next/'):continue
 content=req(path,auth=basic);assert content
 if '.css' in path:css.append(content.decode())
report['static_assets_checked']=len(assets)
assert any('.collage-theme' in s for s in css),'Latest collage stylesheet missing'
report['checks'].append('production JS/CSS assets and latest collage stylesheet')
root=Path('/opt/dada-6780/current');report['build_id']=(root/'frontend/.next/BUILD_ID').read_text().strip();assert report['build_id']=='PEQRW1j-iBdLB73DZbCPA'
report['status']='passed';(root/'public-smoke.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');print(json.dumps(report,ensure_ascii=False,indent=2))
