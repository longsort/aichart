/**
 * Railway 단일 진입점: 데이터 수집 서버 백그라운드 실행 후 Next.js가 PORT에서 리스닝.
 * 캔들 서버가 리스닝할 때까지 대기한 뒤 Next 기동 → 껍데기만 보이는 현상 방지.
 */
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const http = require('http');

const port = process.env.PORT || '3000';
const serverPort = process.env.SERVER_PORT || '3001';
console.log('[start] PORT=', port, 'SERVER_PORT=', serverPort);

const serverPath = path.join(__dirname, 'server', 'index.js');
console.log('[start] starting candles server (Bitget V2 mix only)');
const server = spawn('node', [serverPath], {
  stdio: ['ignore', 'pipe', 'pipe'],
  detached: true,
  env: { ...process.env, SERVER_PORT: serverPort },
  cwd: __dirname,
});
server.unref();
server.stdout?.on('data', (d) => process.stdout.write(d));
server.stderr?.on('data', (d) => process.stderr.write(d));
server.on('error', (err) => console.error('[start] server spawn error:', err.message));

function waitForCandlesServer(maxMs = 15000, intervalMs = 500) {
  const base = `http://127.0.0.1:${serverPort}`;
  const url = `${base}/candles?symbol=BTCUSDT&tf=4h`;
  const deadline = Date.now() + maxMs;
  return new Promise((resolve) => {
    const tryOnce = () => {
      const req = http.get(url, (res) => {
        res.resume();
        if (res.statusCode === 200) {
          console.log('[start] candles server ready');
          return resolve();
        }
        schedule();
      });
      req.on('error', () => schedule());
      req.setTimeout(3000, () => { req.destroy(); schedule(); });
    };
    const schedule = () => {
      if (Date.now() >= deadline) {
        console.log('[start] candles server wait timeout, starting Next anyway');
        return resolve();
      }
      setTimeout(tryOnce, intervalMs);
    };
    tryOnce();
  });
}

function startNext() {
  const nextBin = path.join(__dirname, 'node_modules', 'next', 'dist', 'bin', 'next');
  const useNextBin = fs.existsSync(nextBin);
  const next = useNextBin
    ? spawn(process.execPath, [nextBin, 'start'], { stdio: 'inherit', env: { ...process.env, PORT: port }, cwd: __dirname })
    : spawn('npx', ['next', 'start'], { stdio: 'inherit', env: { ...process.env, PORT: port }, cwd: __dirname });
  next.on('exit', (code, sig) => {
    process.exit(code != null ? code : sig ? 1 : 0);
  });
}

waitForCandlesServer().then(startNext);
