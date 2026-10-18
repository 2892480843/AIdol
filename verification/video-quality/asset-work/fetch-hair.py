import urllib.request,io,zipfile,pathlib,concurrent.futures,json,struct,zlib,re,hashlib
HERE=pathlib.Path(__file__).resolve().parent
OLD=HERE.parents[1]/'avatar-studio/research-assets'
exec((OLD/'fetch-selected-assets.py').read_text().split('r=RemoteZip(URL)')[0])
ROOT=HERE
packs={'hair01':['elvs_french_braid_variation']}
manifest=json.loads((HERE/'download-manifest.json').read_text())
for pack,names in packs.items():
 page=urllib.request.urlopen('https://static.makehumancommunity.org/assets/assetpacks/'+pack+'.html').read().decode()
 (HERE/f'{pack}-source.html').write_text(page)
 url=re.search(r'href="(https://files2[^\"]+\.zip)"',page).group(1)
 z=zipfile.ZipFile(RemoteZip(url));infos=[i for i in z.infolist() if not i.is_dir() and any('/'+n+'/' in '/'+i.filename for n in names)]
 print(pack,'selected',len(infos),'bytes',sum(i.compress_size for i in infos),flush=True)
 def extract(i):
  p=HERE/'sources'/i.filename
  if not(p.exists() and p.stat().st_size==i.file_size):
   rz=RemoteZip(url);rz.seek(i.header_offset);vals=struct.unpack('<4s5H3I2H',rz.read(30));a,b=vals[-2:];rz.seek(i.header_offset+30+a+b);data=rz.read(i.compress_size)
   if i.compress_type==8:data=zlib.decompress(data,-15)
   if len(data)!=i.file_size or zlib.crc32(data)&0xffffffff!=i.CRC:raise ValueError('integrity mismatch')
   p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(data)
  return {'file':str(p.relative_to(HERE)),'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'bytes':p.stat().st_size,'archive':url,'license':'CC0-1.0'}
 with concurrent.futures.ThreadPoolExecutor(max_workers=5) as ex:manifest.extend(ex.map(extract,infos))
 (HERE/'download-manifest.json').write_text(json.dumps(manifest,indent=2))
print('DONE',len(manifest))
