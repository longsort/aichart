/**
 * dev — 포트 점유 시 자동 해제 후 Next.js dev 시작 (Windows/macOS/Linux)
 */
import { spawn, execSync } from 'node:child_process';
import { platform } from 'node:os';

const PORT = Number(process.env.PORT || 3000);

function killPort(port) {
  const os = platform();
  try {
    if (os === 'win32') {
      const out = execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
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
          console.log(`[dev] port ${port} freed (pid ${pid})`);
        } catch {
          /* already gone */
        }
      }
      return;
    }
    try {
      execSync(`lsof -ti:${port} | xargs kill -9 2>/dev/null`, { stdio: 'ignore', shell: true });
      console.log(`[dev] port ${port} freed`);
    } catch {
      /* port free */
    }
  } catch {
    /* port free */
  }
}

killPort(PORT);

const child = spawn(
  process.execPath,
  [
    '--max-old-space-size=12288',
    './node_modules/next/dist/bin/next',
    'dev',
    '-H',
    process.env.HOST || '0.0.0.0',
    '-p',
    String(PORT),
  ],
  { stdio: 'inherit', cwd: process.cwd(), env: process.env }
);

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 0);
});

process.on('SIGINT', () => child.kill('SIGINT'));
process.on('SIGTERM', () => child.kill('SIGTERM'));
