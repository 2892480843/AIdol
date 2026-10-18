import bpy,pathlib,math,json
from mathutils import Vector,Matrix,Euler
ROOT=pathlib.Path(__file__).resolve().parent
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'generated/female.blend'))
scene=bpy.context.scene;body=bpy.data.objects['Body'];rig=bpy.data.objects['Avatar_Rig'];camera=scene.camera
scene.render.resolution_x=800;scene.render.resolution_y=1100;scene.cycles.samples=16
body_original=list(body.data.materials);body_slots=[i for i,m in enumerate(body_original) if m.get('avatarHiddenByOuterwear') is True]
assert len(body_slots)==1
hidden=bpy.data.materials.new('PreviewOnlyHiddenCoveredSkin');hidden.use_nodes=True;hidden.node_tree.nodes.clear();output=hidden.node_tree.nodes.new('ShaderNodeOutputMaterial');trans=hidden.node_tree.nodes.new('ShaderNodeBsdfTransparent');hidden.node_tree.links.new(trans.outputs['BSDF'],output.inputs['Surface'])
def retarget(name,child_name,direction):
 bone=rig.pose.bones[name];child=rig.pose.bones[child_name];bpy.context.view_layer.update();head=bone.head.copy();current=(child.head-head).normalized();delta=current.rotation_difference(Vector(direction).normalized()).to_matrix().to_4x4();bone.matrix=Matrix.Translation(head)@delta@Matrix.Translation(-head)@bone.matrix;bpy.context.view_layer.update()
def pose(kind):
 for pb in rig.pose.bones:
  pb.rotation_mode='QUATERNION';pb.rotation_quaternion=(1,0,0,0);pb.location=(0,0,0);pb.scale=(1,1,1)
 if kind=='editorial':
  for name,angles in [('spine_03',(0,-.08,-.025)),('neck_01',(0,.065,.015)),('head',(-.018,.055,.02))]:rig.pose.bones[name].rotation_quaternion=Euler(angles).to_quaternion()
 bpy.context.view_layer.update()
 for side,sign in [('l',1),('r',-1)]:
  editorial=kind=='editorial';retarget('upperarm_'+side,'lowerarm_'+side,(sign*(.2 if side=='l' else .14) if editorial else sign*.14,-.035 if editorial else -.015,-1))
  retarget('lowerarm_'+side,'hand_'+side,(sign*.025 if editorial and side=='l' else sign*.07,-.11 if editorial else -.06,-1))
def wardrobe(coat,dress=True):
 bpy.data.objects['Outerwear'].hide_render=not coat;bpy.data.objects['Dress'].hide_render=coat or not dress;bpy.data.objects['Tops'].hide_render=coat or dress;bpy.data.objects['Bottoms'].hide_render=dress and not coat
 for i in body_slots:body.data.materials[i]=hidden if coat else body_original[i]
 bpy.data.objects['Bottoms'].data.shape_keys.key_blocks['OuterwearLayerFit'].value=1.0 if coat else 0.0
 for name in ['Body','BaseCoverage','Hair','Eyes','Eyebrows','Eyelashes']:bpy.data.objects[name].hide_render=False
views={'back':(.18,3.8,1.02),'side':(3.8,0,1.02),'front':(.18,-3.8,1.02)}
for coat,view,dress in [(True,'back',False),(True,'side',False),(False,'side',False)]:
 pose('relaxed');wardrobe(coat,dress=dress);camera.location=views[view];camera.data.lens=58;camera.rotation_euler=(Vector((0,0,.89))-camera.location).to_track_quat('-Z','Y').to_euler();scene.render.filepath=str(ROOT/'generated'/f'female-final-morph-coat-{int(coat)}-{view}.png');bpy.ops.render.render(write_still=True)
print('REAR_PREVIEWS_DONE',json.dumps({'views':3,'conditionalMaterialSlots':body_slots,'bodyVertices':len(body.data.vertices),'bodyFaces':len(body.data.polygons),'coatOffMorph':bpy.data.objects['Bottoms'].data.shape_keys.key_blocks['OuterwearLayerFit'].value}))
