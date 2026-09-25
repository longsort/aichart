/**
 * 프로덕션: Next(PORT) + 캔들 서버(SERVER_PORT) 동시 기동.
 * VPS: .env.production / .env.local 에서 환경변수 로드 (추가 패키지 없음).
 */
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const root = __dirname;

/**
 * @param {string} fp
 * @param {boolean} override 이후 파일이 기존 값 덮어쓰기
 */
function loadEnvFile(fp, override) {
  if (!fs.existsSync(fp)) return;
  const text = fs.readFileSync(fp, 'utf8');
  for (let line of text.split('\n')) {
    line = line.replace(/^\uFEFF/, '').trim();
    if (!line || line.startsWith('#')) continue;
    if (line.startsWith('export ')) line = line.slice(7).trim();
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    const k = line.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(k)) continue;
    let v = line.slice(eq + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (override || process.env[k] === undefined) process.env[k] = v;
  }
}

const isProd = process.env.NODE_ENV === 'production';
loadEnvFile(path.join(root, '.env.production'), false);
loadEnvFile(path.join(root, '.env.local'), true);
if (!isProd) loadEnvFile(path.join(root, '.env'), false);

const port = String(process.env.PORT || '3000');
const serverPort = process.env.SERVER_PORT || '3001';
/** VPS·LAN: 0.0.0.0 */
const nextHost = process.env.HOSTNAME || process.env.NEXT_HOST || '0.0.0.0';

console.log('[start] Next', nextHost + ':' + port, 'candles SERVER_PORT=', serverPort);

const nextBin = path.join(__dirname, 'node_modules', 'next', 'dist', 'bin', 'next');
const useNextBin = fs.existsSync(nextBin);
const nextArgs = ['--max-old-space-size=6144', nextBin, 'start', '-H', nextHost, '-p', port];
const next = useNextBin
  ? spawn(process.execPath, nextArgs, {
      stdio: 'inherit',
      env: { ...process.env, PORT: port, SERVER_PORT: serverPort },
      cwd: __dirname,
    })
  : spawn('npx', ['next', 'start', '-H', nextHost, '-p', port], {
      stdio: 'inherit',
      env: { ...process.env, PORT: port, SERVER_PORT: serverPort },
      cwd: __dirname,
    });

next.on('error', (err) => {
  console.error('[start] Next error:', err.message);
  process.exit(1);
});

next.on('exit', (code, sig) => {
  process.exit(code != null ? code : sig ? 1 : 0);
});

/**
 * instrumentation 자체 루프 보조 — curl로 동일 cron API 호출.
 * (락으로 중복 실행 스킵) TELEGRAM_AUTO_ALERT_SELF_LOOP=0 이면 끔.
 */
function startTelegramSelfPollBackup() {
  if (String(process.env.TELEGRAM_AUTO_ALERT_SELF_LOOP || '1').trim() === '0') return;
  const secret = String(
    process.env.TELEGRAM_MULTITF_CRON_SECRET || process.env.INTERNAL_ANALYZE_SECRET || ''
  )
    .trim()
    .replace(/^["']|["']$/g, '');
  if (!secret) {
    console.warn('[start] telegram self-poll skip: TELEGRAM_MULTITF_CRON_SECRET empty');
    return;
  }
  const base = String(process.env.INTERNAL_API_BASE_URL || `http://127.0.0.1:${port}`)
    .trim()
    .replace(/\/$/, '');
  const interval = Math.max(
    60_000,
    Math.min(600_000, Number(process.env.TELEGRAM_AUTO_ALERT_INTERVAL_MS || 120_000) || 120_000)
  );
  const boot = Math.max(
    20_000,
    Math.min(180_000, Number(process.env.TELEGRAM_AUTO_ALERT_BOOT_DELAY_MS || 70_000) || 70_000)
  );
  const url = `${base}/api/cron/telegram-auto-alert`;
  const tick = () => {
    const u = new URL(url);
    const lib = u.protocol === 'https:' ? require('https') : require('http');
    const req = lib.request(
      {
        hostname: u.hostname,
        port: u.port || (u.protocol === 'https:' ? 443 : 80),
        path: u.pathname + u.search,
        method: 'GET',
        headers: { Authorization: `Bearer ${secret}` },
        timeout: 170_000,
      },
      (res) => {
        let body = '';
        res.on('data', (c) => {
          body += c;
        });
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 400) {
            console.warn('[start] telegram self-poll', res.statusCode, body.slice(0, 200));
          } else {
            console.info('[start] telegram self-poll ok', body.slice(0, 160));
          }
        });
      }
    );
    req.on('error', (err) => console.warn('[start] telegram self-poll err', err.message));
    req.on('timeout', () => {
      req.destroy();
      console.warn('[start] telegram self-poll timeout');
    });
    req.end();
  };
  console.log('[start] telegram self-poll armed', { url, intervalMs: interval, bootDelayMs: boot });
  setTimeout(() => {
    tick();
    setInterval(tick, interval);
  }, boot);
}
startTelegramSelfPollBackup();

const serverPath = path.join(__dirname, 'server', 'index.js');
const nodeModRoot = path.join(__dirname, 'node_modules');
const prevNodePath = process.env.NODE_PATH || '';
const serverEnv = {
  ...process.env,
  SERVER_PORT: serverPort,
  NODE_PATH: prevNodePath ? `${nodeModRoot}${path.delimiter}${prevNodePath}` : nodeModRoot,
};
/** detached 끔 → PM2 재시작 시 캔들 프로세스도 함께 종료. NODE_PATH 로 루트 node_modules 확실히 탐색 */
const server = spawn(process.execPath, [serverPath], {
  stdio: ['ignore', 'pipe', 'pipe'],
  detached: false,
  env: serverEnv,
  cwd: __dirname,
});
server.stdout?.on('data', (d) => process.stdout.write(d));
server.stderr?.on('data', (d) => process.stderr.write(d));
server.on('error', (err) => console.error('[start] candles server spawn error:', err.message));

console.log('[start] Next.js binding to PORT', port, '; candles server starting in background');
