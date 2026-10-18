from pathlib import Path
from PIL import Image,ImageDraw,ImageFilter,ImageEnhance
import gzip,math,json
HERE=Path(__file__).resolve().parent;OLD=HERE.parents[1]/'avatar-studio/research-assets';MPFB=OLD/'mpfb2-master/src/mpfb/data'
tex=OLD/'system-assets/skins/young_asian_female/young_lightskinned_female_diffuse3.png'
im=Image.open(tex).convert('RGB');im.thumbnail((2048,2048));w,h=im.size
uv=[];faces=[]
for line in (MPFB/'3dobjs/base.obj').read_text().splitlines():
 if line.startswith('vt '):uv.append(tuple(map(float,line.split()[1:3])))
 elif line.startswith('f '):faces.append([tuple(map(int,x.split('/')[:2])) for x in line.split()[1:]])
weights={}
for n in ['mouth-upperlip-volume-incr','mouth-lowerlip-volume-incr']:
 data=[]
 for line in gzip.open(MPFB/'targets/mouth'/f'{n}.target.gz','rt'):
  if not line.strip() or line.startswith('#'):continue
  p=line.split();idx=int(p[0]);m=math.sqrt(sum(float(x)**2 for x in p[1:]));data.append((idx,m))
 peak=max(x[1] for x in data)
 for idx,m in data:weights[idx+1]=max(weights.get(idx+1,0),m/peak)
mask=Image.new('L',(w,h));d=ImageDraw.Draw(mask)
for f in faces:
 value=sum(weights.get(idx,0) for idx,ti in f)/len(f)
 if value>.38:
  d.polygon([(uv[ti-1][0]*w,(1-uv[ti-1][1])*h) for idx,ti in f],fill=round(min(1,(value-.3)/.4)*90))
mask=mask.filter(ImageFilter.GaussianBlur(1.1))
# Soft rose tint follows lip topology; original pore and lip texture remain visible.
rose=ImageEnhance.Color(im).enhance(1.09)
r,g,b=rose.split();rose=Image.merge('RGB',(r.point(lambda x:min(255,x*1.035+1)),g.point(lambda x:x*.80),b.point(lambda x:x*.88)))
im=Image.composite(rose,im,mask)
# Slight warmth/saturation while retaining the real skin texture detail.
im=ImageEnhance.Color(im).enhance(1.035)
out=HERE/'fabric-textures/female-editorial-skin.png';im.save(out)
mask.save(HERE/'fabric-textures/lip-topology-mask.png')
print('lipMaskBounds',mask.getbbox(),'imageSize',im.size)
