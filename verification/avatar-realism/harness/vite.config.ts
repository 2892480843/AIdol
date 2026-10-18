import { defineConfig } from '../../../frontend/node_modules/vite/dist/node/index.js';
import react from '../../../frontend/node_modules/@vitejs/plugin-react/dist/index.js';
import { fileURLToPath } from 'node:url';
import { createReadStream } from 'node:fs';
import { writeFile } from 'node:fs/promises';
const root = fileURLToPath(new URL('./', import.meta.url));
const frontend = fileURLToPath(new URL('../../../frontend/', import.meta.url));
const candidates: Record<string,string> = {
 '/candidate/face.glb':'face-surface-trial.glb',
 '/candidate/trial.glb':'../avatar-realism/material-trial.glb',
 '/candidate/body150.glb':'dada-dopamine-body-150k-8k.glb',
 '/candidate/body2m.glb':'dada-dopamine-body-source-8k.glb',
};
export default defineConfig({root,publicDir:frontend+'public',define:{'process.env.NEXT_PUBLIC_AVATAR_ASSET_REVISION':'""'},
 plugins:[react(),{name:'local-realism-comparison',configureServer(server){
  server.middlewares.use((req,res,next)=>{
   const candidate=candidates[(req.url||'').split('?')[0]];
   if(!candidate){next();return;}
   res.setHeader('Content-Type','model/gltf-binary');
   createReadStream(new URL(candidate==='face-surface-trial.glb'?'../face-surface-trial.glb':candidate==='../avatar-realism/material-trial.glb'?'../material-trial.glb':'../../dopamine-avatar/originals/'+candidate,import.meta.url)).pipe(res);
  });
  server.middlewares.use('/__qa/photo',async(req,res)=>{
   const name=String(req.headers['x-qa-name']||'');
   if(req.method!=='POST'||req.headers.origin!=='http://localhost:3001'||! /^(current|body150|body2m|trial|face)-(full|portrait)-(0|45|90|180)\.png$/.test(name)){res.statusCode=403;res.end();return;}
   try{let size=0;const chunks:Buffer[]=[];for await(const c of req){size+=c.length;if(size>16*1024*1024)throw Error('Too large');chunks.push(c);}await writeFile(new URL('../'+name,import.meta.url),Buffer.concat(chunks));res.statusCode=204;res.end();}catch{res.statusCode=400;res.end();}
  });
 }}],
 resolve:{alias:{'@':frontend,'three/addons':frontend+'node_modules/three/examples/jsm',three:frontend+'node_modules/three',react:frontend+'node_modules/react','react-dom':frontend+'node_modules/react-dom'}},
 server:{host:'127.0.0.1',port:3001,strictPort:true,fs:{allow:[root,frontend]}}
});
