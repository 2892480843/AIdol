"""Store only route templates/counts, never tokens, signed URLs, or request bodies."""
import collections,json,subprocess,sys
from pathlib import Path
p=Path(sys.argv[1]);data=json.loads(p.read_text())
r=subprocess.run(['/Applications/Docker.app/Contents/Resources/bin/docker','logs','--since',data['since'],'--until',data['until'],'wardrobe-backend'],capture_output=True,text=True,check=True)
counts=collections.Counter();durations=collections.defaultdict(list)
for line in (r.stdout+'\n'+r.stderr).splitlines():
 try: entry=json.loads(line)
 except (json.JSONDecodeError,ValueError): continue
 route=entry.get('route','')
 if '/tryon/' not in route: continue
 key=f"{entry.get('method')} {route} {entry.get('http_status')}"
 counts[key]+=1
 if isinstance(entry.get('duration_ms'),(float,int)): durations[key].append(entry['duration_ms'])
data['server_requests']=dict(counts);data['server_duration_ms']=dict(durations)
p.write_text(json.dumps(data,indent=2)+'\n');print(json.dumps(data,indent=2))
