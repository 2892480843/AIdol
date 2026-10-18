import bpy,sys,pathlib,json,bmesh,struct,hashlib
from mathutils import Vector
from mathutils.bvhtree import BVHTree
HERE=pathlib.Path(__file__).resolve().parent
SEX=sys.argv[sys.argv.index('--')+1]
OUT=HERE/'generated'
bpy.ops.wm.open_mainfile(filepath=str(OUT/f'{SEX}.blend'))
body=bpy.data.objects['Body'];rig=bpy.data.objects['Avatar_Rig'];cover=bpy.data.objects['BaseCoverage']
# Reload final subtle topology-aware lip finish and preserve directional strand highlights.
if SEX=='female':
 skin=bpy.data.images.load(str(HERE/'fabric-textures/female-editorial-skin.png'),check_existing=False)
 for mat in body.data.materials:
  for node in mat.node_tree.nodes:
   if node.type=='TEX_IMAGE' and node.image and 'female-editorial-skin' in node.image.name:node.image=skin
hair_tint=(.6,.4,.26,1) if SEX=='female' else (.12,.09,.075,1)
for mat in bpy.data.objects['Hair'].data.materials:
 for node in mat.node_tree.nodes:
  if node.type=='MIX_RGB':node.inputs[2].default_value=hair_tint
# Opaque fallback patches stay well within every real garment's covered zone.
bm=bmesh.new();bm.from_mesh(cover.data)
remove=[v for v in bm.verts if not ((.862<(cover.matrix_world@v.co).z<.925) )]
bmesh.ops.delete(bm,geom=remove,context='VERTS');bm.to_mesh(cover.data);bm.free()
# Check body clearance on real trouser/foot surfaces before relaxed-arm posing.
bvh=BVHTree.FromPolygons([body.matrix_world@v.co for v in body.data.vertices],[tuple(p.vertices) for p in body.data.polygons])
fits=[]
for ob in bpy.context.scene.objects:
 if ob.type!='MESH' or ob.get('avatarLayer') not in ['tops','bottoms','dresses','shoes']:continue
 count=0;max_shift=0
 for v in ob.data.vertices:
  world=ob.matrix_world@v.co;hit,normal,index,distance=bvh.find_nearest(world)
  if hit is None or distance>.025:continue
  signed=(world-hit).dot(normal)
  if signed>=.002:continue
  shift=normal*(.003-signed);delta=ob.matrix_world.inverted().to_3x3()@shift
  v.co+=delta
  if ob.data.shape_keys:
   for key in ob.data.shape_keys.key_blocks:key.data[v.index].co+=delta
  count+=1;max_shift=max(max_shift,shift.length)
 fits.append({'name':ob.name,'adjustedVertices':count,'maxClearanceShiftM':max_shift})
(HERE/f'{SEX}-fit.json').write_text(json.dumps(fits,indent=2))
for image in bpy.data.images:
 if image.source=='FILE' and image.size[0]>0:image.pack()
avatars=[o for o in bpy.context.scene.objects if o.type in {'MESH','ARMATURE'}]
bpy.ops.object.select_all(action='DESELECT')
for ob in avatars:ob.select_set(True)
bpy.context.view_layer.objects.active=rig
bpy.ops.export_scene.gltf(filepath=str(OUT/f'{SEX}.glb'),export_format='GLB',use_selection=True,export_extras=True,export_animations=False,export_morph=True,export_yup=True,export_apply=False,export_image_format='JPEG',export_jpeg_quality=90)
p=OUT/f'{SEX}.glb';raw=p.read_bytes();jlen=struct.unpack_from('<I',raw,12)[0];j=json.loads(raw[20:20+jlen]);tail=raw[20+jlen:]
j['asset']['copyright']='CC0-1.0 MakeHuman / MPFB Community and credited asset authors. See NOTICE.txt and PROVENANCE.json.'
for m in j.get('materials',[]):
 if m.get('name','').startswith('Hair_'):
  m['pbrMetallicRoughness']['baseColorFactor']=list(hair_tint);m['pbrMetallicRoughness']['roughnessFactor']=.8
  m.setdefault('extensions',{})['KHR_materials_specular']={'specularFactor':.16}
if 'KHR_materials_specular' not in j.setdefault('extensionsUsed',[]):j['extensionsUsed'].append('KHR_materials_specular')
jraw=json.dumps(j,separators=(',',':')).encode();jraw+=b' '*((-len(jraw))%4)
p.write_bytes(struct.pack('<III',0x46546c67,2,20+len(jraw)+len(tail))+struct.pack('<II',len(jraw),0x4E4F534A)+jraw+tail)
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/f'{SEX}.blend'))
manifest=json.loads((OUT/f'{SEX}-manifest.json').read_text());manifest.update(bytes=p.stat().st_size,sha256=hashlib.sha256(p.read_bytes()).hexdigest(),clearanceFits=fits)
(OUT/f'{SEX}-manifest.json').write_text(json.dumps(manifest,indent=2))
print('FINALIZED',SEX,manifest['bytes'],manifest['sha256'],json.dumps(fits),flush=True)
