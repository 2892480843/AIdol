import bpy,pathlib,json
r=pathlib.Path(__file__).resolve().parent
bpy.ops.wm.open_mainfile(filepath=str(r/'generated/female.blend'))
print('BODY_GROUPS',json.dumps([g.name for g in bpy.data.objects['Body'].vertex_groups]))
for name in ['Tops_knit','Shoes_ankle-boots','Shoes_ballet-flats','Shoes_sneakers']:
 o=bpy.data.objects[name];print('SOURCE',name,[(k,o[k]) for k in o.keys() if 'delete' in k.lower()])
