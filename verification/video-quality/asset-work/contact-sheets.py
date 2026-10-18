from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
import json,hashlib,sys
HERE=Path(__file__).resolve().parent;PUB=HERE.parents[2]/'frontend/public/models/avatar/v2';THUMB=PUB/'thumbs';THUMB.mkdir(exist_ok=True)
order=['sweet','minimal','street','relaxed','elegant','sport']
font=ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf',20)
proof={}
for sex in sys.argv[1:] or ['female','male']:
 stamp=(HERE/'generated'/f'{sex}.blend').stat().st_mtime
 sheet=Image.new('RGB',(840,860),'#e8e0d6');draw=ImageDraw.Draw(sheet);records=[]
 for i,preset in enumerate(order):
  src=HERE/'thumb-renders'/f'{sex}-{preset}-front.png';assert src.exists(),src
  assert src.stat().st_mtime>=stamp,('stale render',src)
  im=Image.open(src).convert('RGB');assert im.size==(280,400)
  im.save(THUMB/f'{sex}-{preset}.webp',quality=90,method=6)
  x=(i%3)*280;y=(i//3)*430;sheet.paste(im,(x,y));draw.text((x+16,y+405),preset,font=font,fill='#2f2925')
  records.append({'file':str(src.relative_to(HERE.parents[2])),'sha256':hashlib.sha256(src.read_bytes()).hexdigest(),'dimensions':list(im.size),'purpose':'actual rendered thumbnail'})
 for src in sorted((HERE/'renders').glob(f'{sex}-*.png')):
  if src.stat().st_mtime<stamp:continue
  im=Image.open(src);records.append({'file':str(src.relative_to(HERE.parents[2])),'sha256':hashlib.sha256(src.read_bytes()).hexdigest(),'dimensions':list(im.size),'purpose':'critical fit/face inspection'})
 sheet.save(HERE.parent/f'assets-{sex}-contact.webp',quality=92,method=6)
 proof[sex]=records
existing=HERE.parent/'assets-render-proof.json'
if existing.exists():proof={**json.loads(existing.read_text()),**proof}
existing.write_text(json.dumps(proof,indent=2)+'\n')
print('Verified 6 fresh rendered WebP thumbnails per requested model; critical fullbody proof retained separately')
