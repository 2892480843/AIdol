import bpy,sys,pathlib,json,math
from mathutils import Vector,Euler
HERE=pathlib.Path(__file__).resolve().parent
SEX=sys.argv[sys.argv.index('--')+1] if '--' in sys.argv else 'female'
ARG=sys.argv[sys.argv.index('--')+2:] if '--' in sys.argv else []
bpy.ops.wm.open_mainfile(filepath=str(HERE/'generated'/f'{SEX}.blend'))
# Discard unused source shader/image datablocks before rendering on the 16GB host.
if hasattr(bpy.data,'orphans_purge'):bpy.data.orphans_purge(do_recursive=True)
FEMALE=SEX=='female'
COLORS={
'sweet':['f0c8d2','ede1d3','d9a5b8','e8cbbc','f5eee3'],
'minimal':['eeeae0','454b49','b8b0a1','c8b99e','ece8e0'],
'street':['4a4c56','394254','363b43','74734e','ede9df'],
'relaxed':['d5d4c0','b1b7aa','a3afa0','d5c6af','eee7d9'],
'elegant':['ebe1d3','5a4c4a','7e4352','a2836e','493d3b'],
'sport':['a5c7b5','313d46','647d83','7a92a4','ecece7']}
F={
'sweet':dict(tops='cropped-tee',bottoms='mini-skirt',shoes='ballet-flats'),
'minimal':dict(outerwear='blazer',bottoms='tailored',shoes='ballet-flats'),
'street':dict(tops='cropped-tee',bottoms='cargo',shoes='ankle-boots'),
'relaxed':dict(tops='knit',bottoms='tailored',shoes='sneakers'),
'elegant':dict(dresses='halter',shoes='ballet-flats'),
'sport':dict(tops='cropped-tee',bottoms='cargo',shoes='sneakers')}
M={
'sweet':dict(tops='polo',bottoms='tailored',shoes='sneakers'),
'minimal':dict(outerwear='blazer',bottoms='tailored',shoes='ankle-boots'),
'street':dict(tops='tee',bottoms='cargo',shoes='ankle-boots'),
'relaxed':dict(tops='knit',bottoms='tailored',shoes='sneakers'),
'elegant':dict(outerwear='blazer',bottoms='tailored',shoes='ankle-boots'),
'sport':dict(tops='tee',bottoms='cargo',shoes='sneakers')}
LOOKS=F if FEMALE else M
if FEMALE:
 LOOKS['camisole']=dict(tops='camisole',bottoms='tailored',shoes='ballet-flats');COLORS['camisole']=COLORS['minimal']
 LOOKS['shift']=dict(dresses='shift',shoes='ballet-flats');COLORS['shift']=COLORS['elegant']
scene=bpy.context.scene
scene.render.engine='CYCLES';scene.cycles.samples=24;scene.cycles.use_denoising=False
if hasattr(scene.cycles,'use_gpu_denoising'):scene.cycles.use_gpu_denoising=False
print('DENOISING_GPU',getattr(scene.cycles,'use_gpu_denoising','unsupported'),flush=True)
scene.render.threads_mode='FIXED';scene.render.threads=2
scene.render.resolution_x=280 if 'thumbs' in ARG else 700;scene.render.resolution_y=400 if 'thumbs' in ARG else 1000;scene.render.resolution_percentage=100
if 'thumbs' in ARG:scene.cycles.samples=24
scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.56,.53,.48,1);scene.world.node_tree.nodes['Background'].inputs[1].default_value=.35
scene.view_settings.view_transform='AgX';scene.view_settings.exposure=-.2
scene.render.image_settings.file_format='PNG';scene.render.film_transparent=False
body=bpy.data.objects['Body'];top=max((body.matrix_world@v.co).z for v in body.data.vertices)
# Match frontend scene-model.ts editorial pose through real bone directions.
rig=bpy.data.objects['Avatar_Rig']
for pb in rig.pose.bones:
 pb.rotation_mode='QUATERNION';pb.rotation_quaternion=(1,0,0,0)
 offsets={'spine_03':(0,-.08,-.025),'neck_01':(0,.065,.015),'head':(-.018,.055,.02)}
 if pb.name in offsets:pb.rotation_quaternion=Euler(offsets[pb.name],'XYZ').to_quaternion()
bpy.context.view_layer.update()
def point(pb,child,desired):
 current=(rig.matrix_world@child.head)-(rig.matrix_world@pb.head)
 delta=current.normalized().rotation_difference(Vector(desired).normalized())
 rotation=(rig.matrix_world@pb.matrix).to_quaternion()
 pb.rotation_quaternion=pb.rotation_quaternion@(rotation.inverted()@delta@rotation)
 bpy.context.view_layer.update()
for side in ['l','r']:
 upper=rig.pose.bones['upperarm_'+side];lower=rig.pose.bones['lowerarm_'+side];hand=rig.pose.bones['hand_'+side]
 sign=-1 if (rig.matrix_world@upper.head).x<0 else 1
 point(upper,lower,(sign*(.2 if side=='l' else .14),-.035,-1))
 point(lower,hand,(sign*(.025 if side=='l' else .07),-.11,-1))

def aim(ob,target):ob.rotation_euler=(Vector(target)-ob.location).to_track_quat('-Z','Y').to_euler()
def area(name,pos,energy,size,color):
 d=bpy.data.lights.new(name,'AREA');d.energy=energy;d.shape='DISK';d.size=size;d.color=color;o=bpy.data.objects.new(name,d);scene.collection.objects.link(o);o.location=pos;aim(o,(0,0,top*.54));return o
area('Key',(-2.5,-3.5,4),350,3.0,(1,.93,.87));area('Fill',(3,-1.5,2.5),150,3.5,(.83,.91,1));area('Rim',(0,2.5,3),220,2.5,(1,.94,.87))
# Seamless curved studio backdrop follows the camera for consistent 360 proof.
profile=[(-15,-.022),(1,-.022)]
for i in range(1,17):
 angle=(math.pi/2)*i/16;profile.append((1+2*math.sin(angle),-.022+2*(1-math.cos(angle))))
profile.append((3,7))
verts=[(x,y,z) for x in [-12,12] for y,z in profile];length=len(profile)
faces=[(i,i+length,i+length+1,i+1) for i in range(length-1)]
mesh=bpy.data.meshes.new('Cyclorama');mesh.from_pydata(verts,[],faces);mesh.update();floor=bpy.data.objects.new('Cyclorama',mesh);scene.collection.objects.link(floor)
for polygon in mesh.polygons:polygon.use_smooth=True
mat=bpy.data.materials.new('StudioFloor');mat.use_nodes=True;mat.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=(.57,.53,.47,1);mat.node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value=.9;floor.data.materials.append(mat)
d=bpy.data.cameras.new('StudioCamera');cam=bpy.data.objects.new('StudioCamera',d);scene.collection.objects.link(cam);scene.camera=cam;cam.data.type='ORTHO';cam.data.ortho_scale=top*1.15
OUT=HERE/('thumb-renders' if 'thumbs' in ARG else 'renders');OUT.mkdir(exist_ok=True)
def srgb(hex):
 c=[int(hex[i:i+2],16)/255 for i in (0,2,4)]
 return tuple(v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in c)+(1,)
def choose(preset):
 outfit=LOOKS[preset];colors=dict(zip(['tops','bottoms','dresses','outerwear','shoes'],map(srgb,COLORS[preset])))
 for ob in scene.objects:
  layer=ob.get('avatarLayer');variant=ob.get('avatarVariant')
  if variant:
   ob.hide_render=outfit.get(layer)!=variant
   if ob.data.shape_keys:
    for key in ob.data.shape_keys.key_blocks:
     if key.name=='OuterwearLayerFit':key.value=1 if 'outerwear' in outfit else 0
   for mat in ob.data.materials:
    if not mat or not mat.get('avatarRecolor'):continue
    bs=next((n for n in mat.node_tree.nodes if n.type=='BSDF_PRINCIPLED'),None)
    if bs:
     color=colors[layer]
     if mat.node_tree.nodes.get('FashionTint'):
      mat.node_tree.nodes['FashionTint'].inputs[2].default_value=color
     elif bs.inputs['Base Color'].is_linked:
      link=bs.inputs['Base Color'].links[0];src=link.from_socket;mat.node_tree.links.remove(link)
      mix=mat.node_tree.nodes.new('ShaderNodeMixRGB');mix.name='FashionTint';mix.blend_type='MULTIPLY';mix.inputs[0].default_value=1;mix.inputs[2].default_value=color;mat.node_tree.links.new(src,mix.inputs[1]);mat.node_tree.links.new(mix.outputs[0],bs.inputs['Base Color'])
     else:bs.inputs['Base Color'].default_value=color
 for mat in body.data.materials:
  tags=mat.get('avatarHiddenByVariants',[])
  hidden=(bool(mat.get('avatarHiddenByOuterwear')) and 'outerwear' in outfit) or any(tag in [slot+':'+variant for slot,variant in outfit.items()] for tag in tags)
  bs=next(n for n in mat.node_tree.nodes if n.type=='BSDF_PRINCIPLED');bs.inputs['Alpha'].default_value=0 if hidden else 1;mat.surface_render_method='DITHERED'

for preset in [x for x in ARG if x not in ['qa','face','thumbs']] or ['sweet','minimal','street','relaxed','elegant','sport']:
 choose(preset)
 bpy.context.view_layer.update()
 depsgraph=bpy.context.evaluated_depsgraph_get()
 shoe=next(ob for ob in scene.objects if ob.get('avatarLayer')=='shoes' and not ob.hide_render)
 ev=shoe.evaluated_get(depsgraph);shoe_min=min((ev.matrix_world@v.co).z for v in ev.data.vertices)
 floor.location.z=shoe_min+.019
 angles=['front','side','back'] if 'qa' in ARG else ['front']
 for view in angles:
  pos=(.12,-4,top*.68) if view=='front' else (4,0,top*.68) if view=='side' else (-.12,4,top*.68)
  floor.rotation_euler.z=0 if view=='front' else math.pi/2 if view=='side' else math.pi
  cam.location=pos;aim(cam,(0,0,top*.49))
  scene.render.filepath=str(OUT/f'{SEX}-{preset}-{view}.png');print('RENDER_START',SEX,preset,view,flush=True);bpy.ops.render.render(write_still=True)
 if 'face' in ARG:
  cam.location=(.03,-2,top-.13);cam.data.ortho_scale=.52;aim(cam,(0,0,top-.17));scene.render.resolution_x=700;scene.render.resolution_y=700;scene.render.filepath=str(OUT/f'{SEX}-face.png');bpy.ops.render.render(write_still=True)
 print('RENDERED',SEX,preset,flush=True)
