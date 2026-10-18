"""Restore only the female crew-neck opening; no geometry/texture re-export.
The corresponding source selection is in apply-coverage-v2.py. Split index
triangles retain every original attribute, skin weight, material and outerwear flag.
"""
import pathlib,struct,json,copy,hashlib
HERE=pathlib.Path(__file__).resolve().parent
path=HERE/'generated/female.glb';raw=path.read_bytes();jlen=struct.unpack_from('<I',raw,12)[0]
doc=json.loads(raw[20:20+jlen]);binary=bytearray(raw[28+jlen:28+jlen+doc['buffers'][0]['byteLength']])
def array(index):
 a=doc['accessors'][index];view=doc['bufferViews'][a['bufferView']]
 width={'SCALAR':1,'VEC3':3}[a['type']];fmt={5123:'H',5125:'I',5126:'f'}[a['componentType']]
 size=struct.calcsize(fmt)*width;start=view.get('byteOffset',0)+a.get('byteOffset',0)
 return [struct.unpack_from('<'+fmt*width,binary,start+i*view.get('byteStride',size)) for i in range(a['count'])]
def indices(values):
 while len(binary)%4:binary.append(0)
 at=len(binary);binary.extend(struct.pack('<'+'I'*len(values),*values))
 view=len(doc['bufferViews']);doc['bufferViews'].append({'buffer':0,'byteOffset':at,'byteLength':len(values)*4,'target':34963})
 accessor=len(doc['accessors']);doc['accessors'].append({'bufferView':view,'componentType':5125,'count':len(values),'type':'SCALAR','min':[min(values)],'max':[max(values)]})
 return accessor
body=next(doc['meshes'][n['mesh']]for n in doc['nodes'] if n.get('extras',{}).get('avatarLayer')=='body')
knit=next(doc['meshes'][n['mesh']]for n in doc['nodes'] if n.get('extras',{}).get('avatarVariant')=='knit')
collar=max(v[1]for p in knit['primitives']for v in array(p['attributes']['POSITION']))
restored=0;primitives=[]
for primitive in body['primitives']:
 material=doc['materials'][primitive['material']];extras=material.get('extras',{})
 if 'tops:knit' not in extras.get('avatarHiddenByVariants',[]):primitives.append(primitive);continue
 points=array(primitive['attributes']['POSITION']);source=[i[0]for i in array(primitive['indices'])];keep=[];opening=[]
 for at in range(0,len(source),3):
  tri=source[at:at+3]
  expose=any(abs(points[i][0])<.055 and points[i][1]>collar-.05 and points[i][2]>.005 for i in tri)
  (opening if expose else keep).extend(tri)
 if not opening:primitives.append(primitive);continue
 restored+=len(opening)//3
 target=copy.deepcopy(extras);target['avatarHiddenByVariants']=[s for s in target['avatarHiddenByVariants']if s!='tops:knit']
 if not target['avatarHiddenByVariants']:del target['avatarHiddenByVariants']
 material_index=next(i for i,m in enumerate(doc['materials'])if m.get('extras',{})==target and m['name'].startswith('Body_'))
 if keep:
  masked=copy.deepcopy(primitive);masked['indices']=indices(keep);primitives.append(masked)
 visible=copy.deepcopy(primitive);visible['indices']=indices(opening);visible['material']=material_index;primitives.append(visible)
assert restored>0,'Already refined or unexpected geometry'
body['primitives']=primitives;doc['buffers'][0]['byteLength']=len(binary)
json_bytes=json.dumps(doc,separators=(',',':'),ensure_ascii=False).encode();json_bytes+=b' '*((-len(json_bytes))%4);binary.extend(b'\0'*((-len(binary))%4))
result=struct.pack('<III',0x46546c67,2,12+8+len(json_bytes)+8+len(binary))+struct.pack('<II',len(json_bytes),0x4e4f534a)+json_bytes+struct.pack('<II',len(binary),0x004e4942)+binary
path.write_bytes(result)
record={'sex':'female','restoredTriangles':restored,'openingRule':'abs(x)<0.055m, front>0.005m, height>fitted collar maximum minus 0.050m; any vertex restores triangle','collarMaxM':collar,'preserved':'all positions, weights, normals, UVs, shoe masks and conditional outerwear flags','sha256':hashlib.sha256(result).hexdigest()}
(HERE.parent/'assets-neckline.json').write_text(json.dumps(record,indent=2)+'\n')
coverage_path=HERE.parent/'assets-coverage.json';coverage=json.loads(coverage_path.read_text());coverage['female']['necklineRefinement']=record;coverage_path.write_text(json.dumps(coverage,indent=2)+'\n')
print(json.dumps(record,indent=2))
