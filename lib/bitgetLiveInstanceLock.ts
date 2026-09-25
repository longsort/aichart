/**
 * LOCAL / SERVER LIVE 인스턴스 락.
 * - 죽은 PID 락은 즉시 회수 (재시작 후 하루종일 423 방지)
 * - 같은 호스트 LOCAL끼리 교체 허용 (dev 재시작)
 * - SERVER↔LOCAL 동시: 서로 막지 않음 (동시접속 OK) — 이중주문 주의는 상태만 표시
 */
import fs from 'fs';
import path from 'path';
import os from 'os';

export type RunMode = 'LOCAL' | 'SERVER';

const LOCK_TTL_MS = 90_000;

function lockPath(): string {
  return path.join(process.cwd(), 'data', 'bitget-live-instance.lock');
}

export function getRunMode(): RunMode {
  const m = String(process.env.RUN_MODE || '').toUpperCase();
  if (m === 'SERVER' || m === 'PROD' || m === 'PRODUCTION') return 'SERVER';
  if (m === 'LOCAL' || m === 'DEV' || m === 'DEVELOPMENT') return 'LOCAL';
  if (process.env.NODE_ENV === 'production' && !process.env.VERCEL) return 'SERVER';
  return 'LOCAL';
}

export function getLiveInstanceId(): string {
  const mode = getRunMode();
  const host = os.hostname().slice(0, 24) || 'host';
  const pid = process.pid;
  return `${mode === 'SERVER' ? 'SERVER-PROD' : 'LOCAL-DEV'}:${host}:${pid}`;
}

type LockFile = {
  instanceId: string;
  runMode: RunMode;
  acquiredAt: number;
  heartbeatAt: number;
};

function readLock(): LockFile | null {
  try {
    const raw = fs.readFileSync(lockPath(), 'utf8');
    const j = JSON.parse(raw) as LockFile;
    if (!j?.instanceId || !j.heartbeatAt) return null;
    return j;
  } catch {
    return null;
  }
}

function writeLock(lock: LockFile): void {
  const dir = path.dirname(lockPath());
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(lockPath(), JSON.stringify(lock, null, 2), 'utf8');
}

/** instanceId 끝 PID가 살아 있는지 (Windows/Unix) */
function isLockHolderProcessAlive(instanceId: string): boolean {
  const parts = String(instanceId || '').split(':');
  const pid = Number(parts[parts.length - 1]);
  if (!Number.isFinite(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function sameHost(a: string, b: string): boolean {
  const ha = String(a || '').split(':')[1] || '';
  const hb = String(b || '').split(':')[1] || '';
  return Boolean(ha && hb && ha === hb);
}

/**
 * LIVE 주문 전 호출.
 * 죽은 락·로컬 재시작 락은 회수. LOCAL↔SERVER는 서로 차단하지 않음.
 */
export function tryAcquireLiveLock(): {
  ok: boolean;
  instanceId: string;
  runMode: RunMode;
  holder?: string;
  msg: string;
} {
  const instanceId = getLiveInstanceId();
  const runMode = getRunMode();
  const now = Date.now();
  const cur = readLock();

  if (cur && cur.instanceId !== instanceId) {
    const stale = now - cur.heartbeatAt > LOCK_TTL_MS;
    const holderAlive = isLockHolderProcessAlive(cur.instanceId);
    const crossMode =
      (runMode === 'LOCAL' && cur.runMode === 'SERVER') ||
      (runMode === 'SERVER' && cur.runMode === 'LOCAL');
    const localReplaceLocal =
      runMode === 'LOCAL' &&
      cur.runMode === 'LOCAL' &&
      sameHost(cur.instanceId, instanceId);

    /** 동시 LOCAL+SERVER 허용 — 차단하지 않고 내 락으로 기록 */
    if (crossMode) {
      writeLock({
        instanceId,
        runMode,
        acquiredAt: now,
        heartbeatAt: now,
      });
      return {
        ok: true,
        instanceId,
        runMode,
        holder: cur.instanceId,
        msg: `LIVE 동시접속 · 상대=${cur.instanceId}`,
      };
    }

    /** 죽은 프로세스 / TTL만료 / 같은PC 로컬 재시작 → 회수 */
    if (!holderAlive || stale || localReplaceLocal) {
      writeLock({
        instanceId,
        runMode,
        acquiredAt: now,
        heartbeatAt: now,
      });
      return {
        ok: true,
        instanceId,
        runMode,
        msg: !holderAlive
          ? 'LIVE 락 회수 · 이전 프로세스 종료됨'
          : localReplaceLocal
            ? 'LIVE 락 교체 · 로컬 재시작'
            : 'LIVE lock OK',
      };
    }

    return {
      ok: false,
      instanceId,
      runMode,
      holder: cur.instanceId,
      msg: `다른 로컬 인스턴스가 실주문 중 (${cur.instanceId}) · 그쪽 창을 닫거나 90초 대기`,
    };
  }

  writeLock({
    instanceId,
    runMode,
    acquiredAt: cur?.acquiredAt || now,
    heartbeatAt: now,
  });
  return { ok: true, instanceId, runMode, msg: 'LIVE lock OK' };
}

export function heartbeatLiveLock(): void {
  const instanceId = getLiveInstanceId();
  const cur = readLock();
  if (!cur || cur.instanceId !== instanceId) return;
  writeLock({ ...cur, heartbeatAt: Date.now() });
}

export function releaseLiveLock(): void {
  const instanceId = getLiveInstanceId();
  const cur = readLock();
  if (!cur || cur.instanceId !== instanceId) return;
  try {
    fs.unlinkSync(lockPath());
  } catch {
    /* ignore */
  }
}

export function getLiveLockStatus(): {
  runMode: RunMode;
  instanceId: string;
  heldBy: string | null;
  mine: boolean;
  stale: boolean;
  holderAlive: boolean;
} {
  const instanceId = getLiveInstanceId();
  const runMode = getRunMode();
  const cur = readLock();
  if (!cur) {
    return {
      runMode,
      instanceId,
      heldBy: null,
      mine: false,
      stale: true,
      holderAlive: false,
    };
  }
  const stale = Date.now() - cur.heartbeatAt > LOCK_TTL_MS;
  return {
    runMode,
    instanceId,
    heldBy: cur.instanceId,
    mine: cur.instanceId === instanceId,
    stale,
    holderAlive: isLockHolderProcessAlive(cur.instanceId),
  };
}
