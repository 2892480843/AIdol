import React, { useCallback, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import Scene from '@/components/avatar-studio/scene';
import { AVATAR_PRESETS, AVATAR_PRESET_ORDER, DEFAULT_AVATAR_CONFIG, type AvatarConfig, type AvatarPresetId } from '@/lib/avatar-studio';
import { fashionGarments } from '@/lib/avatar-fashion';
import type { AvatarSceneController } from '@/components/avatar-studio/scene-types';
function QA() {
 const [config,setConfig]=useState<AvatarConfig>({...DEFAULT_AVATAR_CONFIG,renderMode:'editorial',editorialLook:'dopamine',preset:'sweet',palette:AVATAR_PRESETS.sweet,pose:'editorial'});
 const [framing,setFraming]=useState<'full'|'portrait'>('full');const [ready,setReady]=useState(false); const [error,setError]=useState('');const [photo,setPhoto]=useState(''); const [video,setVideo]=useState('');
 const controller=useRef<AvatarSceneController|null>(null);
 const onReady=useCallback(()=>setReady(true),[]); const onError=useCallback((kind:string)=>setError(kind),[]);
 const onController=useCallback((value:AvatarSceneController|null)=>{controller.current=value;},[]);
 const rotate=useCallback((rotation:number)=>setConfig(old=>({...old,rotation})),[]);
 const zoom=useCallback((zoom:number)=>setConfig(old=>({...old,zoom})),[]);
 const choose=(preset:AvatarPresetId)=>setConfig(old=>({...old,preset,palette:AVATAR_PRESETS[preset]}));
 return <main style={{fontFamily:'sans-serif',maxWidth:490,margin:'0 auto',background:'#fffaf7'}}>
 <h1>同源 Three 场景验收</h1><p>直接运行项目中的 Scene 和变体逻辑；此临时工具仅检查模型，不代替正式页面验收。</p>
 <div><button onClick={()=>{setReady(false);setConfig(c=>({...c,editorialLook:"dopamine"}))}}>多巴胺高模</button><button onClick={()=>{setReady(false);setConfig(c=>({...c,editorialLook:"refined"}))}}>精修高模</button><button onClick={()=>setFraming(f=>f==='full'?'portrait':'full')}>全身或面部</button><button onClick={()=>{setReady(false);setConfig(c=>({...c,editorialLook:undefined}))}}>原始高模</button><button onClick={()=>{setReady(false);setConfig(c=>({...c,editorialLook:"street"}))}}>街头高模</button>{AVATAR_PRESET_ORDER.map(p=><button key={p} onClick={()=>choose(p)}>{p}</button>)}<button onClick={()=>{setReady(false);setError('');setConfig(c=>({...c,model:c.model==='female'?'male':'female'}))}}>切换性别</button></div>
 <div>{[0,90,180,-90].map(a=><button key={a} onClick={()=>rotate(a)}>视角{a}</button>)}
 <button onClick={()=>setConfig(c=>({...c,pose:c.pose==='editorial'?'relaxed':'editorial'}))}>切换姿态</button>
 <button onClick={async()=>{if(controller.current){const b=await controller.current.capture();await fetch("/__qa/photo",{method:"POST",headers:{"Content-Type":b.type,"X-QA-Name":`${config.model}-${config.editorialLook??"original"}-${framing}-${config.rotation===0?"front":config.rotation===90?"side":config.rotation===180?"back":"left"}.png`},body:b});setPhoto(URL.createObjectURL(b));}}}>实际PNG</button><button onClick={async()=>{try{if(controller.current?.captureTurntable){const b=await controller.current.captureTurntable();await fetch("/__qa/video",{method:"POST",headers:{"Content-Type":b.type},body:b});setVideo(URL.createObjectURL(b));}}catch(e){setError(String(e))}}}>实际360视频</button></div>
 <output data-model={config.model} data-preset={config.preset} data-ready={ready} style={{display:'block'}}>{JSON.stringify({model:config.model,look:config.editorialLook??"original",preset:config.preset,rotation:config.rotation,ready,error})}</output>
 <div style={{position:'relative',overflow:'hidden',height:640,width:'100%',background:'#eeebe8'}}><Scene framing={framing} config={{...config,garments:fashionGarments(config)}}
 dressMode={config.model==='female'&&config.preset==='elegant'} showOuterwear={config.preset==='minimal'||(config.model==='male'&&config.preset==='elegant')}
 autoRotate={false} reducedMotion={true} ariaLabel="同源3D人物" onRotationChange={rotate} onZoomChange={zoom} onReady={onReady} onError={onError} onController={onController}/></div>
 {video&&<video src={video} controls aria-label="实际360视频预览"/>}
 {photo&&<img src={photo} style={{maxWidth:400}} alt="实际导出PNG"/>}
 </main>;
}
createRoot(document.getElementById('root')!).render(<QA/>);
