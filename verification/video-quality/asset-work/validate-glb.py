import pathlib,struct,json,hashlib,math
HERE=pathlib.Path(__file__).resolve().parent
PUB=HERE.parents[2]/'frontend/public/models/avatar/v2'
CAT=json.loads((PUB/'catalogue.json').read_text())
result={}
for sex in ['female','male']:
 path=HERE/'generated'/f'{sex}.glb'
 if not path.exists():continue
 raw=path.read_bytes();magic,version,total=struct.unpack_from('<III',raw)
 assert magic==0x46546c67 and version==2 and total==len(raw)
 jlen,jtype=struct.unpack_from('<II',raw,12);assert jtype==0x4e4f534a
 doc=json.loads(raw[20:20+jlen]);nodes=doc['nodes'];meshes=doc['meshes'];materials=doc['materials'];skins=doc['skins']
 assert len(raw)<25_000_000
 assert all('uri' not in b for b in doc.get('buffers',[]))
 assert all('uri' not in b and 'bufferView'in b for b in doc.get('images',[]))
 assert len(skins)>0 and all(len(s['joints'])>=53 for s in skins)
 # Inspect actual float payloads, not just JSON declarations.
 binary_offset=20+jlen+8
 for accessor in doc.get('accessors',[]):
  if accessor.get('componentType')!=5126 or 'bufferView' not in accessor:continue
  view=doc['bufferViews'][accessor['bufferView']]
  components={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}[accessor['type']]
  width=4*components;stride=view.get('byteStride',width)
  start=binary_offset+view.get('byteOffset',0)+accessor.get('byteOffset',0)
  for at in range(accessor['count']):
   values=struct.unpack_from('<'+'f'*components,raw,start+at*stride)
   assert all(math.isfinite(v) for v in values),'Non-finite payload'
 layers={};mesh_nodes=[];draw_keys=set()
 for node in nodes:
  if 'mesh' not in node:continue
  e=node.get('extras',{});layer=e.get('avatarLayer');variant=e.get('avatarVariant')
  assert layer in ['tops','bottoms','dresses','outerwear','shoes','body','hair','base'],node
  if layer in ['tops','bottoms','dresses','outerwear','shoes']:assert variant
  if variant:layers.setdefault(layer,[]).append(variant)
  if layer!='base':assert 'skin' in node,node['name']
  key=(node['mesh'],node.get('skin'),json.dumps(node.get('matrix')),json.dumps(node.get('translation')),json.dumps(node.get('rotation')))
  assert key not in draw_keys,'Duplicate draw surface instance'
  draw_keys.add(key)
  mesh=meshes[node['mesh']]
  for p in mesh['primitives']:
   assert 'POSITION' in p['attributes'] and 'NORMAL' in p['attributes']
   index=doc['accessors'][p['indices']];view=doc['bufferViews'][index['bufferView']]
   assert index['count']%3==0 and index['type']=='SCALAR'
   fmt={5121:'B',5123:'H',5125:'I'}[index['componentType']];width=struct.calcsize(fmt)
   start=binary_offset+view.get('byteOffset',0)+index.get('byteOffset',0)
   positions=doc['accessors'][p['attributes']['POSITION']]['count']
   for at in range(index['count']):assert struct.unpack_from('<'+fmt,raw,start+at*width)[0]<positions,'Index out of vertex bounds'
   if layer!='base':assert 'JOINTS_0'in p['attributes'] and 'WEIGHTS_0'in p['attributes']
  mesh_nodes.append({'name':node['name'],'layer':layer,'variant':variant,'primitives':len(mesh['primitives'])})
 for layer,variants in layers.items():assert len(set(variants))==len(variants),(layer,variants)
 assert len(layers['tops'])>=3
 assert len(layers['bottoms'])>=(3 if sex=='female' else 2)
 assert len(layers['shoes'])>=(3 if sex=='female' else 2)
 for preset,slots in CAT[sex].items():
  for slot,variant in slots.items():assert variant in layers[slot],(preset,slot,variant)
 variant_masks=[{'material':m['name'],'variants':m['extras']['avatarHiddenByVariants']} for m in materials if m.get('extras',{}).get('avatarHiddenByVariants')]
 assert {'tops:knit','shoes:ankle-boots'}.issubset({v for m in variant_masks for v in m['variants']})
 assert all(isinstance(m['variants'],list) and all(isinstance(v,str) for v in m['variants']) for m in variant_masks)
 assert all(m.get('pbrMetallicRoughness',{}).get('metallicFactor',1)==0 for m in materials if m.get('extras',{}).get('avatarRecolor'))
 result[sex]={'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest(),'boneCount':len(skins[0]['joints']),'meshCount':len(mesh_nodes),'materialCount':len(materials),'imageCount':len(doc.get('images',[])),'normalMapCount':sum('normalTexture'in m for m in materials),'variantMasks':variant_masks,'layers':layers,'meshes':mesh_nodes,'checks':'GLB2, embedded-only, budget,53+joints, skinning, layer metadata, unique variants, no duplicate draw instance, finite binary floats, triangle index bounds, every catalogue entry exists'}
(HERE.parent/'assets-audit.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result,indent=2))
