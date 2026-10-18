import { defineConfig } from '../../../frontend/node_modules/vite/dist/node/index.js';
import { writeFile } from 'node:fs/promises';
import react from '../../../frontend/node_modules/@vitejs/plugin-react/dist/index.js';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('./', import.meta.url));
const frontend = fileURLToPath(new URL('../../../frontend/', import.meta.url));
export default defineConfig({
  root, publicDir: frontend + 'public', plugins: [react(), {
  name: 'local-video-verification-output',
  configureServer(server) {
    server.middlewares.use('/__qa/photo', async (req,res) => {
      const name=String(req.headers['x-qa-name']||'');
      if(req.method!=='POST'||req.headers.origin!=='http://localhost:3001'||! /^(female|male)-(original|street|refined)-(full|portrait)-(front|side|back|left)\.png$/.test(name)){res.statusCode=403;res.end();return;}
      try {const chunks: Buffer[]=[];let size=0;for await(const data of req){size+=data.length;if(size>16*1024*1024)throw new Error('Too large');chunks.push(data);}
      await writeFile(new URL('../'+name,import.meta.url),Buffer.concat(chunks));res.statusCode=204;res.end();}
      catch{res.statusCode=400;res.end();}
    });
    server.middlewares.use('/__qa/video', async (req, res) => {
      if (req.method !== 'POST' || req.headers.origin !== 'http://localhost:3001') { res.statusCode=403;res.end();return; }
      try {
        const chunks: Buffer[]=[];let bytes=0;
        for await (const data of req) { bytes+=data.length;if(bytes>16*1024*1024) throw new Error('Too large');chunks.push(data); }
        await writeFile(new URL('../actual-turntable.webm', import.meta.url), Buffer.concat(chunks));
        res.statusCode=204;res.end();
      } catch { res.statusCode=400;res.end(); }
    });
  }
}],
  resolve: { alias: { '@': frontend, 'react-dom': frontend + 'node_modules/react-dom', react: frontend + 'node_modules/react' } },
  server: { host: '127.0.0.1', port: 3001, strictPort: true, fs: { allow: [root, frontend] } },
});
