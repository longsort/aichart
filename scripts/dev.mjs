/**
 * npm run d — Next.js dev + analyze ping 로그 정리
 *
 * - GET /api/analyze … 줄은 기본 숨김 (카운트만 유지)
 * - 기본 3분마다 터미널 화면 clear (중요 로그만 다시 보이게)
 *
 * env:
 *   DEV_CLEAR_MINUTES=3   클리어 주기(분). 0이면 클리어 안 함
 *   DEV_SHOW_ANALYZE=1    analyze 요청 로그 그대로 표시
 *   DEV_NO_CLEAR=1        주기 클리어 끔
 *   PORT / HOST           기존과 동일
 */
import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { platform } from 'node:os';
import readline from 'node:readline';

const PORT = Number(process.env.PORT || 3000);
const clearMinutesRaw = process.env.DEV_CLEAR_MINUTES;
const clearMinutes =
  process.env.DEV_NO_CLEAR === '1'
    ? 0
    : Number.isFinite(Number(clearMinutesRaw))
      ? Math.max(0, Number(clearMinutesRaw))
      : 3;
const showAnalyze = process.env.DEV_SHOW_ANALYZE === '1';

/** Next request log: GET /api/analyze?... 200 in 115ms */
const ANALYZE_PING_RE = /^\s*(?:○\s*)?GET\s+\/api\/analyze\b/i;

let analyzeHidden = 0;
let lastBannerAt = Date.now();
let keepLines = [];

function killPort(port) {
  const os = platform();
  try {
    if (os === 'win32') {
      const out = execSync(`netstat -ano | findstr :${port}`, {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'ignore'],
      });
      const pids = new Set();
      for (const line of out.split(/\r?\n/)) {
        if (!line.includes('LISTENING')) continue;
        const parts = line.trim().split(/\s+/);
        const pid = parts[parts.length - 1];
        if (pid && /^\d+$/.test(pid) && pid !== '0') pids.add(pid);
      }
      for (const pid of pids) {
        try {
          execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' });
          console.log(`[d] port ${port} freed (pid ${pid})`);
        } catch {
          /* already gone */
        }
      }
      return;
    }
    try {
      execSync(`lsof -ti:${port} | xargs kill -9 2>/dev/null`, {
        stdio: 'ignore',
        shell: true,
      });
      console.log(`[d] port ${port} freed`);
    } catch {
      /* port free */
    }
  } catch {
    /* port free */
  }
}

function ensureDevDirs() {
  for (const rel of [
    '.next/static/development',
    '.next/static/chunks',
    '.next/cache',
    '.next/server',
  ]) {
    fs.mkdirSync(path.join(process.cwd(), rel), { recursive: true });
  }
}

function clearScreen() {
  // ANSI clear + home (Windows Terminal / ConPTY / most IDE terminals)
  process.stdout.write('\x1B[2J\x1B[3J\x1B[H');
}

function printBanner(reason) {
  const mins = Math.max(1, Math.round((Date.now() - lastBannerAt) / 60000));
  const cleared = analyzeHidden;
  analyzeHidden = 0;
  lastBannerAt = Date.now();
  const host = process.env.HOST || '0.0.0.0';
  console.log(
    `[d] ${reason} · http://${host === '0.0.0.0' ? '127.0.0.1' : host}:${PORT}` +
      (cleared ? ` · 숨긴 /api/analyze ${cleared}건 (~${mins}분)` : '') +
      (clearMinutes > 0 ? ` · ${clearMinutes}분마다 clear` : '')
  );
  if (keepLines.length) {
    for (const line of keepLines.slice(-40)) console.log(line);
  }
}

function shouldHide(line) {
  if (showAnalyze) return false;
  return ANALYZE_PING_RE.test(line);
}

function handleLine(line, stream) {
  const text = String(line ?? '');
  if (!text.trim()) return;
  if (shouldHide(text)) {
    analyzeHidden += 1;
    return;
  }
  keepLines.push(text);
  if (keepLines.length > 80) keepLines = keepLines.slice(-80);
  stream.write(text + '\n');
}

killPort(PORT);
ensureDevDirs();

const turbo = !process.argv.includes('--webpack');
const devArgs = [
  '--max-old-space-size=12288',
  './node_modules/next/dist/bin/next',
  'dev',
  ...(turbo ? ['--turbo'] : []),
  '-H',
  process.env.HOST || '0.0.0.0',
  '-p',
  String(PORT),
];

console.log(
  `[d] starting next dev` +
    (showAnalyze ? '' : ' · /api/analyze ping 숨김') +
    (clearMinutes > 0 ? ` · ${clearMinutes}분마다 화면 clear` : '')
);

const child = spawn(process.execPath, devArgs, {
  stdio: ['inherit', 'pipe', 'pipe'],
  cwd: process.cwd(),
  env: process.env,
});

const outRl = readline.createInterface({ input: child.stdout });
const errRl = readline.createInterface({ input: child.stderr });
outRl.on('line', (line) => handleLine(line, process.stdout));
errRl.on('line', (line) => handleLine(line, process.stderr));

let clearTimer = null;
if (clearMinutes > 0) {
  clearTimer = setInterval(() => {
    clearScreen();
    printBanner('화면 clear');
  }, clearMinutes * 60 * 1000);
  clearTimer.unref?.();
}

child.on('exit', (code, signal) => {
  if (clearTimer) clearInterval(clearTimer);
  outRl.close();
  errRl.close();
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 0);
});

process.on('SIGINT', () => child.kill('SIGINT'));
process.on('SIGTERM', () => child.kill('SIGTERM'));
