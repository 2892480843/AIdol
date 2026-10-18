import React,{useState,useRef,useCallback} from 'react';
import {createRoot} from 'react-dom/client';
import Scene from './diagnostic-scene';
import {DEFAULT_AVATAR_CONFIG} from '@/lib/avatar-studio';
import type {AvatarSceneController} from '@/components/avatar-studio/scene-types';
const candidates={face:'/candidate/face.glb',trial:'/candidate/trial.glb',current:'/models/avatar/dopamine-v1/female.glb',body150:'/candidate/body150.glb',body2m:'/candidate/body2m.glb'};
function QA(){
 const [candidate,setCandidate]=useState<keyof typeof candidates>('current');
 const [portrait,setPortrait]=useState(true);const [rotation,setRotation]=useState(0);
 const [ready,setReady]=useState(false);const [error,setError]=useState('');const [saved,setSaved]=useState('');
 const controller=useRef<AvatarSceneController|null>(null);
 const onReady=useCallback(()=>setReady(true),[]);const onError=useCallback((s:string)=>setError(s),[]);
 const onController=useCallback((c:AvatarSceneController|null)=>{controller.current=c;},[]);
 const framing=portrait?'portrait':'full';
 return <main style={{fontFamily:'sans-serif',maxWidth:700,margin:'auto'}}>
 <h1>人物真实感：同灯光、同相机对比</h1>
 <p>原始生产场景副本，仅切换加载资源。诊断工具，不代表已发布改进。</p>
 <div>{(Object.keys(candidates) as (keyof typeof candidates)[]).map(c=><button aria-pressed={candidate===c} key={c} onClick={()=>{setReady(false);setError('');setCandidate(c)}}>{c==='face'?'面部曲面校正':c==='trial'?'分区材质试验':c==='current'?'当前上线版':c==='body150'?'原始15万面':'原始197万面'}</button>)}
 <button onClick={()=>setPortrait(v=>!v)}>面部 / 全身</button>{[0,45,90,180].map(a=><button key={a} onClick={()=>setRotation(a)}>视角 {a}</button>)}
 <button disabled={!ready} onClick={async()=>{try{const b=await controller.current!.capture();const name=`${candidate}-${framing}-${rotation}.png`;const response=await fetch('/__qa/photo',{method:'POST',headers:{'Content-Type':b.type,'X-QA-Name':name},body:b});if(!response.ok)throw Error('Save failed');setSaved(name);}catch(e){setError(String(e))}}}>保存实际渲染</button></div>
 <output style={{display:'block'}}>{JSON.stringify({candidate,framing,rotation,ready,error,saved})}</output>
 <div style={{height:640,position:'relative',background:'#eeebe8'}}><Scene key={candidate} diagnosticAsset={candidates[candidate]} config={{...DEFAULT_AVATAR_CONFIG,renderMode:'editorial',editorialLook:'dopamine',rotation,zoom:1}} framing={framing} dressMode={false} showOuterwear={false} autoRotate={false} reducedMotion={true} ariaLabel="实际3D人物对比" onRotationChange={setRotation} onZoomChange={()=>{}} onReady={onReady} onError={onError} onController={onController}/></div>
 </main>;
}
createRoot(document.getElementById('root')!).render(<QA/>);
