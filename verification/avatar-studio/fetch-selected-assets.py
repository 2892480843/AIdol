import urllib.request,io,zipfile,pathlib,concurrent.futures,json,time
ROOT=pathlib.Path(__file__).resolve().parent
URL='https://files2.makehumancommunity.org/asset_packs/makehuman_system_assets/makehuman_system_assets_cc0.zip'
class RemoteZip(io.RawIOBase):
 def __init__(self,url):
  self.url=url;self.pos=0;self.length=int(urllib.request.urlopen(urllib.request.Request(url,method='HEAD')).headers['Content-Length']);self.cache={}
 def seekable(self):return True
 def readable(self):return True
 def tell(self):return self.pos
 def seek(self,p,whence=0):
  self.pos=p if whence==0 else (self.pos+p if whence==1 else self.length+p);return self.pos
 def read(self,n=-1):
  if n<0:n=self.length-self.pos
  n=min(n,self.length-self.pos)
  if n<=0:return b''
  key=(self.pos,self.pos+n-1)
  if key not in self.cache:
   req=urllib.request.Request(self.url,headers={'Range':f'bytes={key[0]}-{key[1]}'})
   with urllib.request.urlopen(req,timeout=60) as r:
    if r.status!=206:raise ValueError('Range not honored')
    self.cache[key]=r.read()
  b=self.cache[key];self.pos+=len(b);return b
r=RemoteZip(URL);z=zipfile.ZipFile(r)
infos=z.infolist()
(ROOT/'system-assets-zip-directory.json').write_text(json.dumps([{'name':i.filename,'size':i.file_size,'compressed':i.compress_size,'offset':i.header_offset} for i in infos],indent=2))
parts=['/eyes/','/eyebrows/eyebrow001/','/eyebrows/eyebrow002/','/eyelashes/eyelashes01/','/hair/long01/','/hair/short04/','/hair/short02/','/clothes/female_casualsuit01/','/clothes/female_casualsuit02/','/clothes/female_elegantsuit01/','/clothes/male_casualsuit03/','/clothes/male_casualsuit04/','/clothes/male_casualsuit01/','/clothes/shoes01/','/clothes/shoes02/','/skins/young_asian_female/','/skins/young_asian_male/','/skins/young_caucasian_female/','/skins/young_caucasian_male/']
selected=[i for i in infos if not i.is_dir() and any(p in '/'+i.filename for p in parts)]
print('selected',len(selected),'decompressed',sum(i.file_size for i in selected),'compressed',sum(i.compress_size for i in selected),flush=True)
out=ROOT/'system-assets'

def extract(i):
 p=out/i.filename
 if p.exists() and p.stat().st_size==i.file_size:return i.filename
 rz=RemoteZip(URL)
 rz.seek(i.header_offset);header=rz.read(30)
 import struct,zlib
 vals=struct.unpack('<4s5H3I2H',header);namelen,extralen=vals[-2:]
 rz.seek(i.header_offset+30+namelen+extralen)
 data=rz.read(i.compress_size)
 if i.compress_type==8:data=zlib.decompress(data,-15)
 if len(data)!=i.file_size:raise ValueError('size mismatch')
 if zlib.crc32(data)&0xffffffff!=i.CRC:raise ValueError('CRC mismatch')
 p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(data)
 return i.filename
with concurrent.futures.ThreadPoolExecutor(max_workers=8) as ex:
 for name in ex.map(extract,selected):print(name,flush=True)
