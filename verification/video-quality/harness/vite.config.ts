import { defineConfig } from '../../../frontend/node_modules/vite/dist/node/index.js';
import react from '../../../frontend/node_modules/@vitejs/plugin-react/dist/index.js';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('./', import.meta.url));
const frontend = fileURLToPath(new URL('../../../frontend/', import.meta.url));
export default defineConfig({
  root, publicDir: frontend + 'public', plugins: [react()],
  resolve: { alias: { '@': frontend, 'react-dom': frontend + 'node_modules/react-dom', react: frontend + 'node_modules/react' } },
  server: { host: '127.0.0.1', port: 3001, strictPort: true, fs: { allow: [root, frontend] } },
});
