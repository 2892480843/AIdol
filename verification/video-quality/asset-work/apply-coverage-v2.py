import bpy,pathlib,json,sys,struct,hashlib
HERE=pathlib.Path(__file__).resolve().parent;OUT=HERE/'generated'
export_tail='for image in bpy.data.images:'+ (HERE/'finalize-v2.py').read_text().split('for image in bpy.data.images:',1)[1]
report={}
for SEX in ['female','male']:
 bpy.ops.wm.open_mainfile(filepath=str(OUT/f'{SEX}.blend'))
 if hasattr(bpy.data,'orphans_purge'):bpy.data.orphans_purge(do_recursive=True)
 body=bpy.data.objects['Body'];rig=bpy.data.objects['Avatar_Rig'];hair_tint=(.6,.4,.26,1) if SEX=='female' else (.12,.09,.075,1)
 mapping={'tops:knit':'toigo_fisherman_sweater','shoes:ankle-boots':'toigo_ankle_boots_'+SEX}
 bone_names=set(rig.data.bones.keys());names={g.index:g.name for g in body.vertex_groups}
 protected_prefixes=('head','neck','hand','thumb','index','middle','ring','pinky')
 candidates={};bounds={}
 for tag,source in mapping.items():
  group=body.vertex_groups.get('Delete.'+source)
  if group is None and tag!='tops:knit':raise AssertionError('Missing author coverage: '+source)
  cap=None
  if tag.startswith('shoes:'):
   shoe=next(o for o in bpy.context.scene.objects if o.get('avatarLayer')=='shoes' and o.get('avatarVariant')==tag.split(':')[1])
   cap=max((shoe.matrix_world@v.co).z for v in shoe.data.vertices)-.006
  selected=set()
  if tag=='tops:knit':
   knit=next(o for o in bpy.context.scene.objects if o.get('avatarLayer')=='tops' and o.get('avatarVariant')=='knit')
   points=[knit.matrix_world@v.co for v in knit.data.vertices]
   hem=min(p.z for p in points if abs(p.x)<.14);collar=max(p.z for p in points)
  for vertex in body.data.vertices:
   weight=next((g.weight for g in vertex.groups if group and g.group==group.index),0)
   if group and weight<.5:continue
   weights=[(g.weight,names[g.group]) for g in vertex.groups if names[g.group] in bone_names]
   dominant=max(weights,default=(0,''))[1]
   if dominant.startswith(protected_prefixes):continue
   if tag=='tops:knit':
    world=body.matrix_world@vertex.co
    if not dominant.startswith(('spine','clavicle','upperarm','lowerarm')):continue
    if not (hem+.004<world.z<collar-.003):continue
    # The front crew-neck opening sits below the shoulder collar maximum.
    if SEX=='female' and abs(world.x)<.055 and world.y<-.005 and world.z>collar-.05:continue
   if cap is not None and (body.matrix_world@vertex.co).z>cap:continue
   selected.add(vertex.index)
  candidates[tag]=selected;bounds[tag]=cap
 base=body.data.materials[0];previous=list(body.data.materials);material_cache={};face_counts={tag:0 for tag in mapping};outer_count=0
 assignments=[]
 for polygon in body.data.polygons:
  outer=bool(previous[polygon.material_index].get('avatarHiddenByOuterwear'))
  tags=tuple(tag for tag,selected in candidates.items() if all(index in selected for index in polygon.vertices))
  for tag in tags:face_counts[tag]+=1
  key=(outer,tags)
  if key not in material_cache:
   mat=base.copy();mat.name='Body_'+('Outerwear_' if outer else '')+('_'.join(tag.replace(':','_').replace('-','_') for tag in tags) or 'Skin')
   mat['avatarRecolor']=False
   if outer:mat['avatarHiddenByOuterwear']=True
   elif 'avatarHiddenByOuterwear' in mat:del mat['avatarHiddenByOuterwear']
   if tags:mat['avatarHiddenByVariants']=list(tags)
   elif 'avatarHiddenByVariants' in mat:del mat['avatarHiddenByVariants']
   material_cache[key]=mat
  assignments.append(key)
 body.data.materials.clear();keys=list(material_cache)
 for mat in material_cache.values():body.data.materials.append(mat)
 for polygon,key in zip(body.data.polygons,assignments):polygon.material_index=keys.index(key)
 for tag,count in face_counts.items():
  if count<20:raise AssertionError('Empty/incomplete source coverage '+tag+': '+str(count))
 summary={'faces':face_counts,'knitCoverageMethod':'Source sweater has no delete_verts; fully covered shoulder/chest/arm bone regions bounded by actual fitted hem and collar, excluding head/neck/hands','shoeMaskUpperBoundsM':bounds,'materialGroups':len(material_cache),'protectedBones':list(protected_prefixes),'bodyVerticesRetained':len(body.data.vertices),'bodyPolygonsRetained':len(body.data.polygons)}
 report[SEX]=summary
 manifest=json.loads((OUT/f'{SEX}-manifest.json').read_text());manifest['conditionalCoverage']=summary;(OUT/f'{SEX}-manifest.json').write_text(json.dumps(manifest,indent=2))
 fits=manifest.get('clearanceFits',[])
 exec(export_tail)
 print('COVERAGE_COMPLETE',SEX,json.dumps(summary),flush=True)
(HERE.parent/'assets-coverage.json').write_text(json.dumps(report,indent=2)+'\n')
