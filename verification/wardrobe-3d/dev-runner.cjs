// Local validation server: reuse only the existing session signing secret in memory.
// Never serialize credentials or dump the container environment.
const { execFileSync, spawn } = require('node:child_process');
const path = require('node:path');
const root = path.resolve(__dirname, '../../frontend');
const container = JSON.parse(execFileSync('/Applications/Docker.app/Contents/Resources/bin/docker', ['inspect', 'wardrobe-frontend'], { encoding: 'utf8' }))[0];
const entry = container.Config.Env.find(value => value.startsWith('NEXTAUTH_SECRET='));
if (!entry) throw new Error('Existing local session configuration is unavailable');
const child = spawn(process.execPath, [require.resolve('next/dist/bin/next', { paths: [root] }), 'dev', '--hostname', '127.0.0.1', '--port', '3001'], {
  cwd: root,
  env: { ...process.env, NEXTAUTH_SECRET: entry.slice('NEXTAUTH_SECRET='.length), NEXTAUTH_URL: 'http://localhost:3001', BACKEND_URL: 'http://127.0.0.1:18000', NEXT_TELEMETRY_DISABLED: '1' },
  stdio: 'inherit',
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('exit', code => process.exit(code || 0));
