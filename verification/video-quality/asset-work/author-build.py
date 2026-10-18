from pathlib import Path
HERE=Path(__file__).resolve().parent
OLD=HERE.parents[1]/'avatar-studio/research-assets'
s=(OLD/'build-avatars.py').read_text()
s=s.replace("ROOT=pathlib.Path(__file__).resolve().parent\nif (ROOT/'research-assets/mpfb2-master').exists():ROOT=ROOT/'research-assets'\nOUT=ROOT/'generated';OUT.mkdir(exist_ok=True)","HERE=pathlib.Path(__file__).resolve().parent\nROOT=HERE.parents[1]/'avatar-studio/research-assets'\nOUT=HERE/'generated';OUT.mkdir(exist_ok=True)")
s=s.replace("age=0.5,height=0.69 if FEMALE else 0.74,weight=0.36 if FEMALE else 0.44,muscle=0.40 if FEMALE else 0.68,proportions=0.67,cupsize=0.38", "age=0.32,height=0.73 if FEMALE else 0.79,weight=0.30 if FEMALE else 0.39,muscle=0.29 if FEMALE else 0.64,proportions=0.84,cupsize=0.32")
s=s.replace("macro['race']={'asian':0.75,'caucasian':0.25,'african':0.0}","macro['race']={'asian':0.88,'caucasian':0.12,'african':0.0}")
a=s.index("for n,w in [");b=s.index("skin=AS/",a)
s=s[:a]+'''face_targets=[('mouth/mouth-angles-up',.32 if FEMALE else .13),('chin/chin-jaw-drop-decr',.13 if FEMALE else .05),('torso/measure-shoulder-dist-decr',.18 if FEMALE else .0),('head/head-oval',.48 if FEMALE else .12),('chin/chin-width-decr',.34 if FEMALE else .04),('head/head-fat-decr',.13),('nose/nose-scale-horiz-decr',.15 if FEMALE else .06),('mouth/mouth-upperlip-volume-incr',.12 if FEMALE else .04),('mouth/mouth-lowerlip-volume-incr',.08)]
for side in ['l','r']:
 face_targets.extend([(f'eyes/{side}-eye-scale-incr',.18 if FEMALE else .025),(f'eyes/{side}-eye-corner2-up',.08),(f'cheek/{side}-cheek-bones-incr',.14)])
if not FEMALE:face_targets.extend([('chin/chin-width-incr',.12),('chin/chin-bones-incr',.10)])
for n,w in face_targets:
 TargetService.load_target(body,str(ROOT/'mpfb2-master/src/mpfb/data/targets'/f'{n}.target.gz'),weight=w)
''' +s[b:]
s=s.replace("path=AS/rel", "path=HERE/'sources'/rel\n if not path.exists():path=AS/rel")
s=s.replace("add('hair/long01/long01.mhclo' if FEMALE else 'hair/short04/short04.mhclo','hair','Hair',0)","add('hair/elvs_french_braid_variation/elvs_french_braid_variation.mhclo' if FEMALE else 'hair/short02/short02.mhclo','hair','Hair',1)")
a=s.index('if FEMALE:\n tops=');b=s.index('# Bake only',a)
s=s[:a]+'''variants={}
def garment(asset,layer,variant,subdiv=1):
 ob=add(f'clothes/{asset}/{asset}.mhclo',layer,layer.title()+'_'+variant,subdiv)
 ob['avatarVariant']=variant;ob['avatarDefaultVisible']=False
 variants[(layer,variant)]=ob
 return ob
tops=garment('toigo_camisole_top' if FEMALE else 'toigo_fisherman_sweater','tops','camisole' if FEMALE else 'knit')
bottoms=garment('toigo_wool_pants','bottoms','tailored')
shoes=garment('shoes02','shoes','sneakers')
dress=garment('toigo_halter_dress_knee_length','dresses','halter') if FEMALE else None
outer=garment('toigo_female_suit_2' if FEMALE else 'toigo_male_suit_3','outerwear','blazer')
outer['avatarReplacesTops']=True
cargo=garment('cortu_cargo_pants','bottoms','cargo')
tee=garment('joepal_crude_t-shirt_female' if FEMALE else 'elvs_crude_t-shirt_male','tops','cropped-tee' if FEMALE else 'tee')
boots=garment('toigo_ankle_boots_female' if FEMALE else 'toigo_ankle_boots_male','shoes','ankle-boots')
if FEMALE:
 knit=garment('toigo_fisherman_sweater','tops','knit')
 skirt=garment('toigo_tiered_mini_skirt','bottoms','mini-skirt')
 shift=garment('toigo_shift_dress','dresses','shift')
 flats=garment('toigo_ballet_flats','shoes','ballet-flats')
else:
 polo=garment('namuhekam_male_polo_shirt','tops','polo')
''' +s[b:]
s=s.replace(" if ob==shoes:", " if ob==tee and FEMALE:\n  # Crop at the fitted high waistband; preserve complete shoulder/sleeve topology.\n  waist=max((bottoms.matrix_world@v.co).z for v in bottoms.data.vertices)\n  bm=bmesh.new();bm.from_mesh(ob.data)\n  bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),dist=.00001,plane_co=ob.matrix_world.inverted()@Vector((0,0,waist+.008)),plane_no=ob.matrix_world.to_3x3().transposed()@Vector((0,0,1)),clear_inner=True,clear_outer=False);bm.to_mesh(ob.data);bm.free()\n if ob==shoes:",1)
a=s.index(' # Rebuild materials as neutral PBR;');b=s.index(' if ob==outer:\n  # Keep shirt',a)
material=''' # Explicit PBR materials preserve authored weave, seams and leather normal detail.
 source_images=[node.image for mat in ob.data.materials if mat and mat.use_nodes for node in mat.node_tree.nodes if node.type=='TEX_IMAGE' and node.image]
 image=next((im for im in source_images if any(x in im.name.lower() for x in ['diffuse','_diff.','_eye','shirt-knit','skirt','boots','flat']) and not any(x in im.name.lower() for x in ['norm','bump','spec'])),next((im for im in source_images if not any(x in im.name.lower() for x in ['norm','bump','spec'])),None))
 normal_image=next((im for im in source_images if ('norm' in im.name.lower() or '_nrm' in im.name.lower()) and 'objnorm' not in im.name.lower()),None)
 layer=ob.get('avatarLayer');variant=ob.get('avatarVariant','')
 neutral=HERE/'fabric-textures'/((variant+'-'+SEX if variant=='ankle-boots' else variant)+'.png')
 if neutral.exists():image=bpy.data.images.load(str(neutral),check_existing=True)
 if ob==body and FEMALE:image=bpy.data.images.load(str(HERE/'fabric-textures/female-editorial-skin.png'),check_existing=True)
 mat=bpy.data.materials.new(ob.name+'_Material');mat.use_nodes=True
 nt=mat.node_tree;nt.nodes.clear();out=nt.nodes.new('ShaderNodeOutputMaterial');bsdf=nt.nodes.new('ShaderNodeBsdfPrincipled');nt.links.new(bsdf.outputs['BSDF'],out.inputs['Surface'])
 bsdf.inputs['Roughness'].default_value=.50 if ob==body else .76 if layer=='hair' else .89 if layer in ['tops','bottoms','dresses','outerwear'] else .52
 bsdf.inputs['Specular IOR Level'].default_value=.16 if layer=='hair' else .25
 bsdf.inputs['IOR'].default_value=1.4
 if ob==body:bsdf.inputs['Subsurface Weight'].default_value=.055
 colors={'camisole':(.09,.07,.07,1),'cropped-tee':(.83,.79,.70,1),'tee':(.72,.73,.67,1),'knit':(.64,.50,.35,1),'tailored':(.21,.19,.17,1),'cargo':(.24,.28,.18,1),'mini-skirt':(.12,.11,.12,1),'halter':(.28,.025,.055,1),'shift':(.08,.14,.20,1),'ankle-boots':(.055,.04,.035,1),'ballet-flats':(.16,.065,.055,1),'sneakers':(.85,.83,.77,1),'polo':(.17,.23,.24,1)}
 preserve_texture=ob==body or layer in ['hair','base','outerwear'] or variant in ['knit','cargo','mini-skirt','ankle-boots','ballet-flats','polo']
 if image and preserve_texture:
  tex=nt.nodes.new('ShaderNodeTexImage');tex.image=image;tex.interpolation='Linear';nt.links.new(tex.outputs['Color'],bsdf.inputs['Base Color'])
  if layer=='hair' or ob.name in ['Eyebrows','Eyelashes']:
   nt.links.new(tex.outputs['Alpha'],bsdf.inputs['Alpha']);mat.surface_render_method='DITHERED';mat.use_backface_culling=False
  if layer=='hair':
   mat['avatarTint']=[.018,.013,.011,1]
   mix=nt.nodes.new('ShaderNodeMixRGB');mix.blend_type='MULTIPLY';mix.inputs[0].default_value=1;mix.inputs[2].default_value=(.018,.013,.011,1);nt.links.new(tex.outputs['Color'],mix.inputs[1]);nt.links.new(mix.outputs['Color'],bsdf.inputs['Base Color'])
 else:bsdf.inputs['Base Color'].default_value=colors.get(variant,(.3,.3,.3,1))
 if normal_image and layer in ['tops','bottoms','shoes','hair']:
  normal_image.colorspace_settings.name='Non-Color';ntex=nt.nodes.new('ShaderNodeTexImage');ntex.image=normal_image;nmap=nt.nodes.new('ShaderNodeNormalMap');nmap.inputs['Strength'].default_value=.5;nt.links.new(ntex.outputs['Color'],nmap.inputs['Color']);nt.links.new(nmap.outputs['Normal'],bsdf.inputs['Normal'])
 mat['avatarRecolor']=layer in ['tops','bottoms','dresses','outerwear','shoes']
 ob.data.materials.clear();ob.data.materials.append(mat)
'''
s=s[:a]+material+s[b:]
s=s.replace("bs.inputs['Base Color'].default_value=(.09,.11,.14,1)","bs.inputs['Base Color'].default_value=(.055,.065,.08,1)")
# Keep face/scalp intact and previous conditional coverage contract. New bob ends above jacket.
s=s.replace("if ob==tops and not FEMALE:","if ob.get('avatarLayer')=='tops' and ob.get('avatarVariant') in ['knit','tee','polo']:")
s=s.replace("remove=[v for v in bm.verts if not (.76 < (cover.matrix_world@v.co).z < 1.30 and abs((cover.matrix_world@v.co).x)<.235)]", "remove=[v for v in bm.verts if not ((.86 < (cover.matrix_world@v.co).z < .925 and abs((cover.matrix_world@v.co).x)<.15) )]")
s=s.replace("# Export only the avatar hierarchy", "for ob in loaded:\n if ob.get('avatarLayer') in ['tops','bottoms','dresses','outerwear','shoes']:\n  ob['avatarDefaultVisible']=ob in [tops,bottoms,shoes]\n# Export only the avatar hierarchy")
s=s.replace("_m['pbrMetallicRoughness']['baseColorFactor']=[.28,.22,.18,1]","_m['pbrMetallicRoughness']['baseColorFactor']=[.018,.013,.011,1]")
a=s.index('# Application chooses');s=s[:a]+'''# Save before camera setup for deterministic QA renders.
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/f'{SEX}.blend'))
manifest={'sex':SEX,'macro':macro,'faceTargets':face_targets,'meshes':[{'name':o.name,'avatarLayer':o.get('avatarLayer'),'avatarVariant':o.get('avatarVariant'),'verts':len(o.data.vertices),'faces':len(o.data.polygons),'materials':[m.name for m in o.data.materials]} for o in avatars if o.type=='MESH'],'bones':[b.name for b in rig.data.bones],'file':str(OUT/f'{SEX}.glb'),'bytes':(OUT/f'{SEX}.glb').stat().st_size,'sha256':hashlib.sha256((OUT/f'{SEX}.glb').read_bytes()).hexdigest()}
(OUT/f'{SEX}-manifest.json').write_text(json.dumps(manifest,indent=2))
print('AVATAR_V2_COMPLETE',json.dumps({'sex':SEX,'bytes':manifest['bytes'],'sha256':manifest['sha256']}))
'''
s=s.replace("# Body is protected by an opaque torso/pelvis cover as an always-on base, so every preset stays dressed.\n# This cover follows the same skinned surface and is hidden beneath fashion layers.","# Pelvis fallback coverage stays strictly inside every skirt and trouser silhouette.\n# The application enforces a real top+bottom pair or a dress so the torso is always dressed.")
s=s.replace("add('eyebrows/eyebrow001/eyebrow001.mhclo','base','Eyebrows')", "add('eyebrows/eyebrow001/eyebrow001.mhclo' if FEMALE else 'eyebrows/eyebrow002/eyebrow002.mhclo','base','Eyebrows')")
(HERE/'build-v2.py').write_text(s)
print('WROTE',HERE/'build-v2.py')
