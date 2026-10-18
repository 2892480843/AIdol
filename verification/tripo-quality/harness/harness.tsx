import React, { useCallback, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import Scene from '@/components/avatar-studio/scene';
import { AVATAR_PRESETS, AVATAR_PRESET_ORDER, DEFAULT_AVATAR_CONFIG, type AvatarConfig, type AvatarPresetId } from '@/lib/avatar-studio';
import { fashionGarments } from '@/lib/avatar-fashion';
import type { AvatarSceneController } from '@/components/avatar-studio/scene-types';
function QA() {
 const [config,setConfig]=useState<AvatarConfig>({...DEFAULT_AVATAR_CONFIG,renderMode:'editorial',preset:'sweet',palette:AVATAR_PRESETS.sweet,pose:'editorial'});
 const [ready,setReady]=useState(false); const [error,setError]=useState('');const [photo,setPhoto]=useState('');
 const controller=useRef<AvatarSceneController|null>(null);
 const onReady=useCallback(()=>setReady(true),[]); const onError=useCallback((kind:string)=>setError(kind),[]);
 const onController=useCallback((value:AvatarSceneController|null)=>{controller.current=value;},[]);
 const rotate=useCallback((rotation:number)=>setConfig(old=>({...old,rotation})),[]);
 const zoom=useCallback((zoom:number)=>setConfig(old=>({...old,zoom})),[]);
 const choose=(preset:AvatarPresetId)=>setConfig(old=>({...old,preset,palette:AVATAR_PRESETS[preset]}));
 return <main style={{fontFamily:'sans-serif',maxWidth:1000,margin:'0 auto',background:'#fffaf7'}}>
 <h1>同源 Three 场景验收</h1><p>直接运行项目中的 Scene 和变体逻辑；此临时工具仅检查模型，不代替正式页面验收。</p>
 <div>{AVATAR_PRESET_ORDER.map(p=><button key={p} onClick={()=>choose(p)}>{p}</button>)}<button onClick={()=>{setReady(false);setError('');setConfig(c=>({...c,model:c.model==='female'?'male':'female'}))}}>切换性别</button></div>
 <div>{[0,90,180,-90].map(a=><button key={a} onClick={()=>rotate(a)}>视角{a}</button>)}
 <button onClick={()=>setConfig(c=>({...c,pose:c.pose==='editorial'?'relaxed':'editorial'}))}>切换姿态</button>
 <button onClick={async()=>{if(controller.current){const b=await controller.current.capture();setPhoto(URL.createObjectURL(b));}}}>实际PNG</button></div>
 <output data-model={config.model} data-preset={config.preset} data-ready={ready} style={{display:'block'}}>{JSON.stringify({model:config.model,preset:config.preset,rotation:config.rotation,ready,error})}</output>
 <div style={{position:'relative',overflow:'hidden',height:700,width:'100%',background:'#eeebe8'}}><Scene key={config.model} config={{...config,garments:fashionGarments(config)}}
 dressMode={config.model==='female'&&config.preset==='elegant'} showOuterwear={config.preset==='minimal'||(config.model==='male'&&config.preset==='elegant')}
 autoRotate={false} reducedMotion={true} ariaLabel="同源3D人物" onRotationChange={rotate} onZoomChange={zoom} onReady={onReady} onError={onError} onController={onController}/></div>
 {photo&&<img src={photo} style={{maxWidth:400}} alt="实际导出PNG"/>}
 </main>;
}
createRoot(document.getElementById('root')!).render(<QA/>);
