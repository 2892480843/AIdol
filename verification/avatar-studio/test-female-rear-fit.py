import bpy,pathlib,json
from mathutils import Vector
from mathutils.bvhtree import BVHTree
ROOT=pathlib.Path(__file__).resolve().parent
if (ROOT/'research-assets').exists():ROOT=ROOT/'research-assets'
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'generated/female.blend'))
body=bpy.data.objects['Body'];coat=bpy.data.objects['Outerwear'];hair=bpy.data.objects['Hair']
materials=[m for m in body.data.materials if m and m.get('avatarHiddenByOuterwear') is True]
assert len(materials)==1,'Missing precise conditional skin material; old source exposes elbow skin through the coat'
index=next(i for i,m in enumerate(body.data.materials) if m==materials[0]);covered=[p for p in body.data.polygons if p.material_index==index]
assert len(covered)>0,'Empty conditional skin region'
assert materials[0].get('avatarRecolor') is False
protected_prefixes=('head','hand','thumb','index','middle','ring','pinky','thigh','calf','foot','ball','toe')
bones=set(bpy.data.objects['Avatar_Rig'].data.bones.keys());group_names={g.index:g.name for g in body.vertex_groups}
protected_covered=[]
for i in {i for p in covered for i in p.vertices}:
 vertex=body.data.vertices[i];weights=[(g.weight,group_names[g.group]) for g in vertex.groups if group_names[g.group] in bones]
 dominant=max(weights,default=(0,''))[1]
 if dominant.startswith(protected_prefixes):protected_covered.append(i)
assert not protected_covered,'Conditional region includes protected head, hand or leg vertices'
body_top=max((body.matrix_world@v.co).z for v in body.data.vertices)
bvh=BVHTree.FromPolygons([coat.matrix_world@v.co for v in coat.data.vertices],[tuple(p.vertices) for p in coat.data.polygons])
violations=[];tested=0
for v in hair.data.vertices:
 world=hair.matrix_world@v.co
 if world.z>body_top*.86-.071 or world.y<0:continue
 hit,normal,_,_=bvh.ray_cast(Vector((world.x,2,world.z)),Vector((0,-1,0)),4)
 if hit is None or normal.y<0:continue
 tested+=1
 if world.y<hit.y+.015:violations.append(v.index)
assert tested>100,'No meaningful lower hair reference intersections tested'
assert not violations,f'{len(violations)} lower rear hair vertices remain inside coat shell'
print('FEMALE_REAR_REGRESSION',json.dumps({'bodyVertices':len(body.data.vertices),'bodyFaces':len(body.data.polygons),'conditionalFaces':len(covered),'protectedCoveredVertices':len(protected_covered),'rearHairSamples':tested,'hairPenetrationViolations':len(violations),'baseCoveragePresent':bpy.data.objects.get('BaseCoverage') is not None}),flush=True)

bottoms=bpy.data.objects['Bottoms'];assert bottoms.get('avatarOuterwearFitMorph')=='OuterwearLayerFit'
keys=bottoms.data.shape_keys.key_blocks;assert keys['OuterwearLayerFit'].value==0.0,'Coat-off default must retain the original trousers'
assert any((a.co-b.co).length>1e-6 for a,b in zip(keys['Basis'].data,keys['OuterwearLayerFit'].data)),'No fitted trouser morph displacement'
assert all((v.co-k.co).length<1e-6 for v,k in zip(bottoms.data.vertices,keys['Basis'].data)),'Default mesh diverges from original coat-off Basis'
print('TROUSER_MORPH_REGRESSION',json.dumps({'name':bottoms.get('avatarOuterwearFitMorph'),'defaultWeight':keys['OuterwearLayerFit'].value,'otherBodyGeometryPreserved':len(body.data.vertices)==53514 and len(body.data.polygons)==53512}),flush=True)
