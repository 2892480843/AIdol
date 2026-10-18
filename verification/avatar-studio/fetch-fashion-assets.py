import urllib.request,io,zipfile,pathlib,concurrent.futures,json,time,struct,zlib,re
ROOT=pathlib.Path(__file__).resolve().parent
exec((ROOT/'fetch-selected-assets.py').read_text().split('r=RemoteZip(URL)')[0])
packs={
 'shirts01':['elvs_crude_t-shirt_male','toigo_camisole_top','toigo_turtleneck_halter_top','toigo_fisherman_sweater'],
 'pants01':['toigo_wool_pants','cortu_cargo_pants'],
 'dress01':['toigo_halter_dress_knee_length','toigo_shift_dress'],
 'suits01':['toigo_female_suit_2','toigo_male_suit_3'],
}
for pack,names in packs.items():
 page=urllib.request.urlopen('https://static.makehumancommunity.org/assets/assetpacks/'+pack+'.html').read().decode()
 url=re.search(r'href="(https://files2[^\"]+\.zip)"',page).group(1)
 z=zipfile.ZipFile(RemoteZip(url));infos=[i for i in z.infolist() if not i.is_dir() and any(n in i.filename for n in names)]
 (ROOT/f'{pack}-directory.json').write_text(json.dumps([{'name':i.filename,'size':i.file_size} for i in z.infolist()],indent=2))
 print(pack,url,'selected',len(infos),'bytes',sum(i.compress_size for i in infos),flush=True)
 def extract(i):
  p=ROOT/'system-assets'/i.filename
  if p.exists() and p.stat().st_size==i.file_size:return i.filename
  rz=RemoteZip(url);rz.seek(i.header_offset);vals=struct.unpack('<4s5H3I2H',rz.read(30));a,b=vals[-2:];rz.seek(i.header_offset+30+a+b);data=rz.read(i.compress_size)
  if i.compress_type==8:data=zlib.decompress(data,-15)
  if len(data)!=i.file_size or zlib.crc32(data)&0xffffffff!=i.CRC:raise ValueError('integrity mismatch')
  p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(data);return i.filename
 with concurrent.futures.ThreadPoolExecutor(max_workers=8) as ex:
  for n in ex.map(extract,infos):print(n,flush=True)
