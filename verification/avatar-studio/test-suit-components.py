"""Regression: a split blazer must not retain a second floor-length trouser component."""
import bpy,pathlib,json,sys
ROOT=pathlib.Path(__file__).resolve().parent
if (ROOT/'research-assets').exists():ROOT=ROOT/'research-assets'
results=[]
for sex in ['female','male']:
 bpy.ops.wm.open_mainfile(filepath=str(ROOT/'generated'/f'{sex}.blend'))
 body=bpy.data.objects['Body'];outer=bpy.data.objects['Outerwear']
 maxbody=max((body.matrix_world@v.co).z for v in body.data.vertices)
 minimum=min((outer.matrix_world@v.co).z for v in outer.data.vertices)
 row={'sex':sex,'bodyTop':maxbody,'outerwearMin':minimum,'belowKneeThreshold':maxbody*.3,'noGroundedPants':minimum>maxbody*.3,'vertices':len(outer.data.vertices)}
 results.append(row)
 print('SUIT_REGRESSION',json.dumps(row),flush=True)
print('SUIT_RESULTS',json.dumps(results),flush=True)
if not all(x['noGroundedPants'] for x in results):raise AssertionError('Outerwear retained lower-leg geometry from source suit pants')
