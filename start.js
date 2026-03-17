/**
 * Railway: PORT에 가능한 한 빨리 바인딩해야 하므로 Next를 먼저 띄우고,
 * 캔들 서버는 백그라운드로 나중에 기동.
 */
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const port = process.env.PORT || '3000';
const serverPort = process.env.SERVER_PORT || '3001';

console.log('[start] PORT=', port, 'SERVER_PORT=', serverPort);

// 1) Next.js 먼저 기동 → Railway가 PORT 응답 확인
const nextBin = path.join(__dirname, 'node_modules', 'next', 'dist', 'bin', 'next');
const useNextBin = fs.existsSync(nextBin);
const next = useNextBin
  ? spawn(process.execPath, [nextBin, 'start'], {
      stdio: 'inherit',
      env: { ...process.env, PORT: port },
      cwd: __dirname,
    })
  : spawn('npx', ['next', 'start'], {
      stdio: 'inherit',
      env: { ...process.env, PORT: port },
      cwd: __dirname,
    });

next.on('error', (err) => {
  console.error('[start] Next error:', err.message);
  process.exit(1);
});

next.on('exit', (code, sig) => {
  process.exit(code != null ? code : sig ? 1 : 0);
});

// 2) 캔들 서버는 백그라운드로 (실패해도 Next는 유지)
const serverPath = path.join(__dirname, 'server', 'index.js');
const server = spawn('node', [serverPath], {
  stdio: ['ignore', 'pipe', 'pipe'],
  detached: true,
  env: { ...process.env, SERVER_PORT: serverPort },
  cwd: __dirname,
});
server.unref();
server.stdout?.on('data', (d) => process.stdout.write(d));
server.stderr?.on('data', (d) => process.stderr.write(d));
server.on('error', (err) => console.error('[start] candles server spawn error:', err.message));

console.log('[start] Next.js binding to PORT', port, '; candles server starting in background');
