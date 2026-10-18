"""Original adult fashion avatars built locally from official CC0 MakeHuman assets.
No person photographs, network inference or pre-existing character identity are used.
"""
import bpy,sys,pathlib,json,math,hashlib,bmesh
from mathutils import Vector,Quaternion
ROOT=pathlib.Path(__file__).resolve().parent
if (ROOT/'research-assets/mpfb2-master').exists():ROOT=ROOT/'research-assets'
OUT=ROOT/'generated';OUT.mkdir(exist_ok=True)
sys.path.insert(0,str(ROOT/'mpfb2-master'/'src'))
bpy.utils.extension_path_user=lambda *a,**kw:str(ROOT/'mpfb-user')
import mpfb
mpfb.get_preference=lambda name: str(ROOT/'mpfb-user') if name=='mpfb_user_data' else (str(ROOT/'system-assets') if name=='mpfb_second_root' else False if name=='mh_auto_user_data' else None)
mpfb.register()
from mpfb.services.humanservice import HumanService
from mpfb.services.targetservice import TargetService
AS=ROOT/'system-assets'
SEX=sys.argv[sys.argv.index('--')+1] if '--' in sys.argv else 'female'
FEMALE=SEX=='female'
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
macro=TargetService.get_default_macro_info_dict()
macro.update(gender=0.0 if FEMALE else 1.0,age=0.5,height=0.69 if FEMALE else 0.74,weight=0.36 if FEMALE else 0.44,muscle=0.40 if FEMALE else 0.68,proportions=0.67,cupsize=0.38,firmness=0.65)
macro['race']={'asian':0.75,'caucasian':0.25,'african':0.0}
body=HumanService.create_human(macro_detail_dict=macro);body.name='Body';body['avatarLayer']='body'
sub=body.modifiers.new('BeautySubdivision','SUBSURF');sub.levels=1;sub.render_levels=1
for n,w in [('mouth/mouth-angles-up',.11),('cheek/l-cheek-bones-incr',.12),('cheek/r-cheek-bones-incr',.12)]:
 TargetService.load_target(body,str(ROOT/'mpfb2-master/src/mpfb/data/targets'/f'{n}.target.gz'),weight=w)
skin=AS/'skins'/('young_asian_female' if FEMALE else 'young_asian_male')/('young_asian_female.mhmat' if FEMALE else 'young_asian_male.mhmat')
HumanService.set_character_skin(str(skin),body,skin_type='GAMEENGINE')
rig=HumanService.add_builtin_rig(body,'game_engine');rig.name='Avatar_Rig'
loaded=[]
def add(rel,layer,name,subdiv=1):
 path=AS/rel
 if not path.exists():raise RuntimeError('Required asset missing: '+str(path))
 ob=HumanService.add_mhclo_asset(str(path),body,asset_type='Hair' if layer=='hair' else 'Eyes' if name=='Eyes' else 'Eyebrows' if name=='Eyebrows' else 'Eyelashes' if name=='Eyelashes' else 'Clothes',material_type='GAMEENGINE',subdiv_levels=subdiv)
 ob.name=name;ob['avatarLayer']=layer;loaded.append(ob)
 for mat in ob.data.materials:
  if mat: mat.name=name+'_Material'
 return ob
add('eyes/high-poly/high-poly.mhclo','base','Eyes')
add('eyebrows/eyebrow001/eyebrow001.mhclo','base','Eyebrows')
add('eyelashes/eyelashes01/eyelashes01.mhclo','base','Eyelashes')
add('hair/long01/long01.mhclo' if FEMALE else 'hair/short04/short04.mhclo','hair','Hair',0)
if FEMALE:
 tops=add('clothes/toigo_camisole_top/toigo_camisole_top.mhclo','tops','Tops')
else:
 tops=add('clothes/toigo_fisherman_sweater/toigo_fisherman_sweater.mhclo','tops','Tops')
bottoms=add('clothes/toigo_wool_pants/toigo_wool_pants.mhclo','bottoms','Bottoms')
shoes=add('clothes/shoes02/shoes02.mhclo','shoes','Shoes')
dress=add('clothes/toigo_halter_dress_knee_length/toigo_halter_dress_knee_length.mhclo','dresses','Dress') if FEMALE else None
outer=add('clothes/toigo_female_suit_2/toigo_female_suit_2.mhclo' if FEMALE else 'clothes/toigo_male_suit_3/toigo_male_suit_3.mhclo','outerwear','Outerwear')
if dress:dress['avatarDefaultVisible']=False
outer['avatarDefaultVisible']=False;outer['avatarReplacesTops']=True
# Bake only the chosen adult shape, preserve rig weights and independently fitted cloth.
for ob in [body]+loaded:
 bpy.context.view_layer.objects.active=ob
 if ob.data.shape_keys:
  mixed=ob.shape_key_add(name='BakedAdultShape',from_mix=True)
  coords=[v.co.copy() for v in mixed.data]
  ob.shape_key_clear()
  for v,c in zip(ob.data.vertices,coords):v.co=c
 # Clothes-specific masks are omitted, so later outfit changes can reveal intact arms/legs.
 for mod in list(ob.modifiers):
  if mod.type=='MASK' and mod.name.startswith('Delete.'):
   ob.modifiers.remove(mod)
 for mod in list(ob.modifiers):
  if mod.type=='MASK':bpy.ops.object.modifier_apply(modifier=mod.name)
  elif mod.type=='SUBSURF':
   mod.levels=1;mod.render_levels=1;bpy.ops.object.modifier_apply(modifier=mod.name)
 if ob==outer:
  # A suit file contains disconnected jacket/shirt/pants pieces. Keep upper-body pieces only.
  mesh=ob.data;adj={v.index:set() for v in mesh.vertices}
  for e in mesh.edges:adj[e.vertices[0]].add(e.vertices[1]);adj[e.vertices[1]].add(e.vertices[0])
  seen=set();remove=set();components=[]
  for idx in adj:
   if idx in seen:continue
   stack=[idx];seen.add(idx);component=[]
   while stack:
    at=stack.pop();component.append(at)
    for nxt in adj[at]:
     if nxt not in seen:seen.add(nxt);stack.append(nxt)
   height=max((ob.matrix_world@mesh.vertices[i].co).z for i in component)
   minimum=min((ob.matrix_world@mesh.vertices[i].co).z for i in component)
   body_top=max((body.matrix_world@v.co).z for v in body.data.vertices)
   components.append({'verts':len(component),'minZ':minimum,'maxZ':height})
   # The male is taller: classify actual grounded trouser components relative to its body.
   # Keep the published female authoring recipe unchanged.
   is_lower_body=(height<1.10) if FEMALE else (minimum<body_top*.30 and height<body_top*.70)
   if is_lower_body:remove.update(component)
  bm=bmesh.new();bm.from_mesh(mesh);bm.verts.ensure_lookup_table();bmesh.ops.delete(bm,geom=[bm.verts[i] for i in remove],context='VERTS');bm.to_mesh(mesh);bm.free()
  ob['removedLowerSuitVertices']=len(remove);print('SUIT_COMPONENTS',components,'removed',len(remove))
  if not FEMALE and len(remove)!=8123:raise AssertionError('Expected only the identified source male trouser component to be removed')
 if ob==tops and not FEMALE:
  # The crewneck intentionally layers over the trouser waistband; expand only the hem.
  inverse=ob.matrix_world.inverted();waist=max((bottoms.matrix_world@v.co).z for v in bottoms.data.vertices)
  for vertex in ob.data.vertices:
   world=ob.matrix_world@vertex.co
   if waist-.16<world.z<waist+.12 and abs(world.x)<.34:
    amount=max(0,1-abs(world.z-waist)/.16)
    world.x*=1+.20*amount;world.y*=1+.20*amount
    vertex.co=inverse@world
 if ob==outer:
  # Add smooth radial ease without magnifying per-vertex normal discontinuities in source cloth.
  inverse=ob.matrix_world.inverted()
  for vertex in ob.data.vertices:
   world=ob.matrix_world@vertex.co;world.y*=1.035;vertex.co=inverse@world
 if ob==shoes:
  # Remove high sport socks: retain clean low shoes and the intact underlying ankles.
  bm=bmesh.new();bm.from_mesh(ob.data)
  bmesh.ops.delete(bm,geom=[v for v in bm.verts if (ob.matrix_world@v.co).z>.165],context='VERTS');bm.to_mesh(ob.data);bm.free()
  inverse=ob.matrix_world.inverted()
  for vertex in ob.data.vertices:
   world=ob.matrix_world@vertex.co;world.x*=1.025;world.y*=1.055;world.z+=.002;vertex.co=inverse@world
 for face in ob.data.polygons:face.use_smooth=True
 if ob.name=='Eyes':
  for mat in ob.data.materials:mat['avatarRecolor']=False
  continue
 # Rebuild materials as neutral PBR; legacy game-engine node graphs lose alpha in glTF.
 source_images=[node.image for mat in ob.data.materials if mat and mat.use_nodes for node in mat.node_tree.nodes if node.type=='TEX_IMAGE' and node.image]
 image=next((im for im in source_images if 'diffuse' in im.name.lower() or '_eye' in im.name.lower()),source_images[0] if source_images else None)
 mat=bpy.data.materials.new(ob.name+'_Material');mat.use_nodes=True
 nt=mat.node_tree;nt.nodes.clear();out=nt.nodes.new('ShaderNodeOutputMaterial');bsdf=nt.nodes.new('ShaderNodeBsdfPrincipled');nt.links.new(bsdf.outputs['BSDF'],out.inputs['Surface'])
 bsdf.inputs['Roughness'].default_value=.52 if ob==body else .87 if ob.name=='Hair' else .82 if ob in [tops,bottoms,dress,outer] else .58
 if ob.name=='Hair':bsdf.inputs['Specular IOR Level'].default_value=.08
 bsdf.inputs['IOR'].default_value=1.4
 if ob==body:bsdf.inputs['Subsurface Weight'].default_value=.06
 if ob==shoes:
  bsdf.inputs['Base Color'].default_value=(.72,.70,.65,1)
 elif ob in [tops,bottoms,dress]:
  bsdf.inputs['Base Color'].default_value=(.025,.020,.018,1) if FEMALE and ob==tops else (.45,.41,.34,1) if ob==bottoms else (.22,.018,.045,1) if ob==dress else (.12,.16,.21,1)
 elif image:
  tex=nt.nodes.new('ShaderNodeTexImage');tex.image=image;tex.interpolation='Linear';nt.links.new(tex.outputs['Color'],bsdf.inputs['Base Color'])
  if ob.name=='Hair':
   mult=nt.nodes.new('ShaderNodeMixRGB');mult.blend_type='MULTIPLY';mult.inputs[0].default_value=1.0;mult.inputs[2].default_value=(.28,.22,.18,1);nt.links.new(tex.outputs['Color'],mult.inputs[1]);nt.links.new(mult.outputs['Color'],bsdf.inputs['Base Color'])
  if ob.name in ['Hair','Eyebrows','Eyelashes']:
   nt.links.new(tex.outputs['Alpha'],bsdf.inputs['Alpha']);mat.surface_render_method='DITHERED';mat.use_backface_culling=False
 mat['avatarRecolor']=ob.get('avatarLayer') in ['tops','bottoms','dresses','outerwear','shoes']
 ob.data.materials.clear();ob.data.materials.append(mat)
 if ob==outer:
  # Keep shirt, tie and buttons textured; the connected jacket shell gets a neutral recolorable fabric.
  mat['avatarRecolor']=False
  mesh=ob.data;adj={v.index:set() for v in mesh.vertices}
  for edge in mesh.edges:adj[edge.vertices[0]].add(edge.vertices[1]);adj[edge.vertices[1]].add(edge.vertices[0])
  seen=set();parts=[]
  for at in adj:
   if at in seen:continue
   part=set();stack=[at];seen.add(at)
   while stack:
    idx=stack.pop();part.add(idx)
    for nxt in adj[idx]:
     if nxt not in seen:seen.add(nxt);stack.append(nxt)
   parts.append(part)
  shell=max(parts,key=len)
  fabric=bpy.data.materials.new('Outerwear_Fabric');fabric.use_nodes=True;fabric['avatarRecolor']=True
  bs=fabric.node_tree.nodes.get('Principled BSDF');bs.inputs['Base Color'].default_value=(.09,.11,.14,1);bs.inputs['Roughness'].default_value=.82
  ob.data.materials.append(fabric)
  for poly in mesh.polygons:
   if poly.vertices[0] in shell:poly.material_index=1
# The female long hair is authored against a bare body. Fit its lower rear cards
# outside the closed coat so a partially occluded hair sheet cannot resemble a torn back.
# The coat also declares its exact authored skin coverage as a separate material group.
if FEMALE:
 from mathutils.bvhtree import BVHTree
 body_top=max((body.matrix_world@v.co).z for v in body.data.vertices)
 coat_min=min((outer.matrix_world@v.co).z for v in outer.data.vertices)
 coat_bvh=BVHTree.FromPolygons([outer.matrix_world@v.co for v in outer.data.vertices],[tuple(p.vertices) for p in outer.data.polygons])
 hair=bpy.data.objects['Hair'];inverse=hair.matrix_world.inverted();hair_changes=[]
 protected_hair_before=[tuple(v.co) for v in hair.data.vertices if (hair.matrix_world@v.co).z>body_top*.86 or (hair.matrix_world@v.co).y<0]
 for vertex in hair.data.vertices:
  world=hair.matrix_world@vertex.co
  if world.z>body_top*.86 or world.y<0:continue
  hit,normal,_,_=coat_bvh.ray_cast(Vector((world.x,2,world.z)),Vector((0,-1,0)),4)
  if hit is None or normal.y<0 or world.y>=hit.y+.022:continue
  blend=min(1,max(0,(body_top*.86-world.z)/.07));delta=(hit.y+.022-world.y)*blend
  if delta>0:hair_changes.append(delta);world.y+=delta;vertex.co=inverse@world
 protected_hair_after=[tuple(v.co) for v in hair.data.vertices if (hair.matrix_world@v.co).z>body_top*.86 or (hair.matrix_world@v.co).y<0]
 if protected_hair_before!=protected_hair_after:raise AssertionError('Front or scalp hair geometry changed')
 # Fit only upper trousers under an actually closed coat cross-section. Rays through
 # the open front slit have no outward-facing hit and retain the original trouser surface.
 inverse=bottoms.matrix_world.inverted();pant_changes=[];original_pants=[v.co.copy() for v in bottoms.data.vertices]
 for vertex in bottoms.data.vertices:
  world=bottoms.matrix_world@vertex.co
  if world.z<=coat_min+.008:continue
  radial=Vector((world.x,world.y,0));radius=radial.length
  if radius<1e-6:continue
  direction=radial.normalized();hit,normal,_,_=coat_bvh.ray_cast(Vector((direction.x*2,direction.y*2,world.z)),-direction,4)
  if hit is None or normal.dot(direction)<.15:continue
  coat_radius=Vector((hit.x,hit.y,0)).dot(direction);target=max(.025,coat_radius-.014)
  if radius<=target:continue
  blend=min(1,max(0,(world.z-coat_min-.008)/.055));change=(radius-target)*blend
  if change>0:
   pant_changes.append(change);adjusted=direction*(radius-change);world.x=adjusted.x;world.y=adjusted.y;vertex.co=inverse@world
 fitted_pants=[v.co.copy() for v in bottoms.data.vertices]
 for vertex,original in zip(bottoms.data.vertices,original_pants):vertex.co=original
 bottoms.shape_key_add(name='Basis',from_mix=False)
 fit_morph=bottoms.shape_key_add(name='OuterwearLayerFit',from_mix=False)
 for point,fitted in zip(fit_morph.data,fitted_pants):point.co=fitted
 fit_morph.value=0.0;bottoms['avatarOuterwearFitMorph']='OuterwearLayerFit'
 source_group=body.vertex_groups.get('Delete.toigo_female_suit_2')
 if source_group is None:raise AssertionError('Missing authored closed-coat skin mask')
 bone_names=set(rig.data.bones.keys());group_names={g.index:g.name for g in body.vertex_groups}
 protected_prefixes=('head','hand','thumb','index','middle','ring','pinky','thigh','calf','foot','ball','toe')
 candidate=set()
 for vertex in body.data.vertices:
  weight=next((g.weight for g in vertex.groups if g.group==source_group.index),0)
  weights=[(g.weight,group_names[g.group]) for g in vertex.groups if group_names[g.group] in bone_names]
  dominant=max(weights,default=(0,''))[1]
  if weight>=.5 and (body.matrix_world@vertex.co).z>coat_min+.012 and not dominant.startswith(protected_prefixes):candidate.add(vertex.index)
 covered=body.data.materials[0].copy();covered.name='Body_OuterwearCovered_Material';covered['avatarRecolor']=False;covered['avatarHiddenByOuterwear']=True
 covered_index=len(body.data.materials);body.data.materials.append(covered);covered_faces=0
 for polygon in body.data.polygons:
  if all(index in candidate for index in polygon.vertices):polygon.material_index=covered_index;covered_faces+=1
 if covered_faces<100:raise AssertionError('Authored conditional coverage unexpectedly empty')
 body['avatarOuterwearCoverageFaces']=covered_faces
 print('FEMALE_REAR_FIT',json.dumps({'hairChangedVertices':len(hair_changes),'maxHairShift':max(hair_changes,default=0),'protectedFrontScalpUnchanged':protected_hair_before==protected_hair_after,'upperTrouserFitVertices':len(pant_changes),'maxTrouserFitShift':max(pant_changes,default=0),'authoredCoverageFaces':covered_faces,'bodyVerticesUnchanged':len(body.data.vertices)}))
# Relax upper arms in each bone's own basis. Rest data and skin stay available for runtime poses.
for side,sign in [('l',1),('r',-1)]:
 pb=rig.pose.bones['upperarm_'+side]
 rest=pb.bone.matrix_local.to_quaternion()
 direction=(pb.bone.tail_local-pb.bone.head_local).normalized()
 desired=Vector((sign*.19,.025,-.982)).normalized()
 delta=direction.rotation_difference(desired)
 pb.rotation_mode='QUATERNION';pb.rotation_quaternion=rest.inverted()@delta@rest
# Body is protected by an opaque torso/pelvis cover as an always-on base, so every preset stays dressed.
# This cover follows the same skinned surface and is hidden beneath fashion layers.
cover=body.copy();cover.data=body.data.copy();bpy.context.collection.objects.link(cover);cover.name='BaseCoverage';cover['avatarLayer']='base'
bm=bmesh.new();bm.from_mesh(cover.data)
remove=[v for v in bm.verts if not (.76 < (cover.matrix_world@v.co).z < 1.30 and abs((cover.matrix_world@v.co).x)<.235)]
bmesh.ops.delete(bm,geom=remove,context='VERTS');bm.to_mesh(cover.data);bm.free()
mat=bpy.data.materials.new('BaseCoverage_Material');mat.diffuse_color=(.035,.028,.025,1);mat.use_nodes=True
node=mat.node_tree.nodes.get('Principled BSDF');node.inputs['Base Color'].default_value=(.035,.028,.025,1);node.inputs['Roughness'].default_value=.95
cover.data.materials.clear();cover.data.materials.append(mat)
# Small normal offset avoids z-fighting with the underlying skin.
solid=cover.modifiers.new('OpaqueCoverageThickness','SOLIDIFY');solid.thickness=.001;solid.offset=1
bpy.context.view_layer.objects.active=cover;bpy.ops.object.modifier_apply(modifier=solid.name)
# Resize textures to a bounded web budget while embedding all resources in GLB.
for img in bpy.data.images:
 if img.source=='FILE' and img.size[0]>0:
  maxsize=2048 if 'diffuse3' in img.name else 1024
  w,h=img.size
  if max(w,h)>maxsize:img.scale(round(w*maxsize/max(w,h)),round(h*maxsize/max(w,h)))
  img.pack()
# Export only the avatar hierarchy; camera and lights below are preview-only.
avatars=[o for o in bpy.context.scene.objects if o.type in {'MESH','ARMATURE'}]
bpy.ops.object.select_all(action='DESELECT')
for ob in avatars:ob.select_set(True)
bpy.context.view_layer.objects.active=rig
bpy.ops.export_scene.gltf(filepath=str(OUT/f'{SEX}.glb'),export_format='GLB',use_selection=True,export_extras=True,export_animations=False,export_morph=True,export_yup=True,export_apply=False,export_image_format='JPEG',export_jpeg_quality=92)
# glTF exporter does not preserve legacy multiply tint consistently; encode the PBR factor explicitly.
import struct
_gp=OUT/f'{SEX}.glb';_data=_gp.read_bytes();_jlen,_jtype=struct.unpack_from('<II',_data,12);_j=json.loads(_data[20:20+_jlen]);_bin=_data[20+_jlen:]
_j['asset']['copyright']='CC0-1.0 MakeHuman / MPFB Community and credited asset authors. See NOTICE.txt and PROVENANCE.json.'
for _m in _j.get('materials',[]):
 if _m.get('name','').startswith('Hair_'):
  _m['pbrMetallicRoughness']['baseColorFactor']=[.28,.22,.18,1];_m['pbrMetallicRoughness']['roughnessFactor']=.87
  _m.setdefault('extensions',{})['KHR_materials_specular']={'specularFactor':.08}
if 'KHR_materials_specular' not in _j.setdefault('extensionsUsed',[]):_j['extensionsUsed'].append('KHR_materials_specular')
_jraw=json.dumps(_j,separators=(',',':')).encode();_jraw+=b' '*((-len(_jraw))%4)
_gp.write_bytes(struct.pack('<III',0x46546c67,2,20+len(_jraw)+len(_bin))+struct.pack('<II',len(_jraw),0x4E4F534A)+_jraw+_bin)
# Application chooses one outfit before revealing meshes; preview starts in the two-piece look.
if dress:dress.hide_render=True
outer.hide_render=True
# Preview portrait studio, 3/4 light, front view. Final application supplies its own stage.
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=24;scene.cycles.use_denoising=True
scene.render.resolution_x=800;scene.render.resolution_y=1100;scene.render.resolution_percentage=100
scene.world.color=(.22,.23,.25)
scene.view_settings.view_transform='AgX';scene.view_settings.exposure=-.7
def aim(ob,target):ob.rotation_euler=(Vector(target)-ob.location).to_track_quat('-Z','Y').to_euler()
def area(name,pos,energy,size,color):
 d=bpy.data.lights.new(name,'AREA');d.energy=energy;d.shape='DISK';d.size=size;d.color=color;o=bpy.data.objects.new(name,d);scene.collection.objects.link(o);o.location=pos;aim(o,(0,0,1));return o
area('Key',(-2.5,-3.5,3.3),180,3.3,(1,.89,.78));area('Fill',(2.5,-2,2),80,3.0,(.78,.87,1));area('Rim',(0,2.5,2.8),80,3.5,(1,.83,.72))
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.035));floor=bpy.context.object
mat=bpy.data.materials.new('StudioFloor');mat.diffuse_color=(.19,.18,.17,1);floor.data.materials.append(mat)
d=bpy.data.cameras.new('PreviewCamera');cam=bpy.data.objects.new('PreviewCamera',d);scene.collection.objects.link(cam);scene.camera=cam
cam.location=(.18,-3.8,1.02);cam.data.lens=58;aim(cam,(0,0,.89))
scene.render.filepath=str(OUT/f'{SEX}-preview.png');bpy.ops.render.render(write_still=True)
top=max((body.matrix_world@v.co).z for v in body.data.vertices);facez=top-.13
cam.location=(.05,-1.02,facez+.02);cam.data.lens=65;aim(cam,(0,0,facez));scene.render.resolution_x=800;scene.render.resolution_y=800
scene.render.filepath=str(OUT/f'{SEX}-face.png');bpy.ops.render.render(write_still=True)
manifest={'sex':SEX,'source':'MakeHuman/MPFB2 official CC0 core and asset packs','macro':macro,'meshes':[{'name':o.name,'avatarLayer':o.get('avatarLayer'),'verts':len(o.data.vertices),'faces':len(o.data.polygons),'materials':[m.name for m in o.data.materials]} for o in avatars if o.type=='MESH'],'bones':[b.name for b in rig.data.bones],'file':str(OUT/f'{SEX}.glb'),'bytes':(OUT/f'{SEX}.glb').stat().st_size,'sha256':hashlib.sha256((OUT/f'{SEX}.glb').read_bytes()).hexdigest()}
(OUT/f'{SEX}-manifest.json').write_text(json.dumps(manifest,indent=2))
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/f'{SEX}.blend'))
print('AVATAR_COMPLETE',json.dumps({'sex':SEX,'bytes':manifest['bytes'],'sha256':manifest['sha256']}))
