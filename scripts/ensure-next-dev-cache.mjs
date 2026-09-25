/**
 * Next.js dev(Turbopack) — Windows에서 .next/static/development 누락 시
 * _buildManifest.js.tmp ENOENT · "missing required error components" 방지.
 *
 * npm run dev / dev:repair 시작 전에 dev 캐시 디렉터리를 보장한다.
 * --repair: development 정적 캐시·tmp 잔여 파일만 정리 (앱 코드·기능 변경 없음)
 * --free-port: PORT(기본 3000) 점유 프로세스 종료 — EADDRINUSE 방지
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { platform } from 'node:os';

const root = process.cwd();
const repair = process.argv.includes('--repair');
const freePort = process.argv.includes('--free-port') || !process.argv.includes('--no-free-port');
const PORT = Number(process.env.PORT || 3000);

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
          console.log(`[dev-cache] port ${port} freed (pid ${pid})`);
        } catch {
          /* already gone */
        }
      }
      return;
    }
    try {
      execSync(`lsof -ti:${port} | xargs kill -9 2>/dev/null`, { stdio: 'ignore', shell: true });
      console.log(`[dev-cache] port ${port} freed`);
    } catch {
      /* port free */
    }
  } catch {
    /* port free */
  }
}

const DEV_DIRS = [
  '.next/static/development',
  '.next/static/chunks',
  '.next/cache',
  '.next/server',
];

function rmrf(abs) {
  if (fs.existsSync(abs)) fs.rmSync(abs, { recursive: true, force: true });
}

function ensureDir(abs) {
  fs.mkdirSync(abs, { recursive: true });
}

function cleanTmpInDir(abs) {
  if (!fs.existsSync(abs)) return 0;
  let n = 0;
  for (const name of fs.readdirSync(abs)) {
    if (!name.includes('.tmp.')) continue;
    try {
      fs.unlinkSync(path.join(abs, name));
      n += 1;
    } catch {
      /* ignore */
    }
  }
  return n;
}

if (freePort) {
  killPort(PORT);
}

if (repair) {
  console.log('[dev-cache] repair — Turbopack development 캐시 정리');
  rmrf(path.join(root, '.next/static/development'));
  const tmpN = cleanTmpInDir(path.join(root, '.next/static'));
  if (tmpN > 0) console.log(`[dev-cache] removed ${tmpN} stale .tmp manifest file(s)`);
}

for (const rel of DEV_DIRS) {
  ensureDir(path.join(root, rel));
}

console.log('[dev-cache] Next.js dev cache dirs ready');
