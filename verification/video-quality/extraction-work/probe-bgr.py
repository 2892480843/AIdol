"""Local-only SCHP probe. No photo or model content is uploaded."""
from pathlib import Path
import json, time
import numpy as np
from PIL import Image
import onnxruntime as ort

ROOT=Path(__file__).resolve().parents[3]
WORK=Path(__file__).resolve().parent
options=ort.SessionOptions()
options.intra_op_num_threads=2
options.inter_op_num_threads=1
options.execution_mode=ort.ExecutionMode.ORT_SEQUENTIAL
session=ort.InferenceSession(str(WORK/'model/schp-atr-18-int8-static.onnx'), options, providers=['CPUExecutionProvider'])
print('INPUT',[(x.name,x.shape,x.type) for x in session.get_inputs()],flush=True)
print('OUTPUT',[(x.name,x.shape) for x in session.get_outputs()],flush=True)
results=[]
for style in ['female-sweet-front']:
    im=Image.open(WORK/f'inputs/{style}.png').convert('RGB')
    a=np.asarray(im.resize((512,512),Image.Resampling.BILINEAR),dtype=np.float32)/255
    a=a[:,:,::-1].copy()
    a=(a-np.array([.406,.456,.485],dtype=np.float32))/np.array([.225,.224,.229],dtype=np.float32)
    t=time.monotonic()
    logits=session.run(['logits'],{'pixel_values':a.transpose(2,0,1)[None]})[0][0]
    print(style,logits.shape,'seconds',time.monotonic()-t,flush=True)
    seg=logits.argmax(0).astype('uint8')
    out=WORK/'outputs-bgr'/style
    out.mkdir(parents=True,exist_ok=True)
    Image.fromarray(seg).save(out/'labels.png')
    cats=[]
    for name, ids in [('top',[4]),('bottom',[5,6]),('dress',[7]),('shoes',[9,10])]:
        mask=Image.fromarray(np.isin(seg,ids).astype('uint8')*255).resize(im.size,Image.Resampling.NEAREST)
        box=mask.getbbox()
        if not box: continue
        rgba=im.convert('RGBA');rgba.putalpha(mask)
        rgba.crop(box).save(out/f'{name}.png')
        cats.append({'type':name,'pixels':int(np.isin(seg,ids).sum()),'bbox':box})
    results.append({'source':style,'pieces':cats})
(WORK/'probe-bgr-results.json').write_text(json.dumps(results,indent=2))
