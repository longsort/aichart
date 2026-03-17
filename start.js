/**
 * Railway 단일 진입점: 데이터 수집 서버 백그라운드 실행 후 Next.js가 PORT에서 리스닝.
 * 502 방지를 위해 Next.js가 반드시 process.env.PORT 사용.
 */
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const port = process.env.PORT || '3000';
console.log('[start] PORT=', port);

const serverPath = path.join(__dirname, 'server', 'index.js');
const server = spawn('node', [serverPath], {
  stdio: ['ignore', 'pipe', 'pipe'],
  detached: true,
  env: { ...process.env, SERVER_PORT: process.env.SERVER_PORT || '3001' },
  cwd: __dirname,
});
server.unref();
server.stdout?.on('data', (d) => process.stdout.write(d));
server.stderr?.on('data', (d) => process.stderr.write(d));
server.on('error', (err) => console.error('[start] server spawn error:', err.message));

const nextBin = path.join(__dirname, 'node_modules', 'next', 'dist', 'bin', 'next');
const useNextBin = fs.existsSync(nextBin);
const next = useNextBin
  ? spawn(process.execPath, [nextBin, 'start'], { stdio: 'inherit', env: { ...process.env, PORT: port }, cwd: __dirname })
  : spawn('npx', ['next', 'start'], { stdio: 'inherit', env: { ...process.env, PORT: port }, cwd: __dirname });
next.on('exit', (code, sig) => {
  process.exit(code != null ? code : sig ? 1 : 0);
});
