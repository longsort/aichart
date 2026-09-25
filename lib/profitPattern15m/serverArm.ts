/**
 * 수익패턴 서버 ARM — 브라우저 없어도 cron이 읽음.
 * data/eagle1/profit_pattern_server_arm.json
 */
import fs from 'fs';
import path from 'path';
import { PROFIT_PATTERN_CORE_SYMBOLS } from '@/lib/profitPattern15m/skill';

const FILE = path.join(
  process.cwd(),
  'data',
  'eagle1',
  'profit_pattern_server_arm.json'
);

export type PpServerArmState = {
  liveArmed: boolean;
  /** 스캔·진입 대상 */
  symbols: string[];
  leverage: number;
  marginUsdt: number;
  /** paperOnly=true 이면 키 있어도 실주문 안 함 */
  paperOnly: boolean;
  updatedAt: number;
  updatedBy?: string;
};

const DEFAULT: PpServerArmState = {
  liveArmed: false,
  symbols: [...PROFIT_PATTERN_CORE_SYMBOLS],
  leverage: 50,
  marginUsdt: 10,
  paperOnly: false,
  updatedAt: 0,
};

function ensureDir() {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
}

export function readPpServerArm(): PpServerArmState {
  try {
    const j = JSON.parse(fs.readFileSync(FILE, 'utf8')) as Partial<PpServerArmState>;
    const symbols = Array.isArray(j.symbols)
      ? j.symbols
          .map((s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, ''))
          .filter((s) => s.endsWith('USDT'))
      : [...DEFAULT.symbols];
    return {
      liveArmed: Boolean(j.liveArmed),
      symbols: symbols.length ? symbols : [...DEFAULT.symbols],
      leverage: Math.max(1, Math.min(125, Number(j.leverage) || 50)),
      marginUsdt: Math.max(1, Number(j.marginUsdt) || 10),
      paperOnly: Boolean(j.paperOnly),
      updatedAt: Number(j.updatedAt) || 0,
      updatedBy: j.updatedBy ? String(j.updatedBy) : undefined,
    };
  } catch {
    return { ...DEFAULT, symbols: [...DEFAULT.symbols] };
  }
}

export function writePpServerArm(
  patch: Partial<PpServerArmState> & { updatedBy?: string }
): PpServerArmState {
  const prev = readPpServerArm();
  const next: PpServerArmState = {
    ...prev,
    ...patch,
    symbols: Array.isArray(patch.symbols)
      ? patch.symbols
          .map((s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, ''))
          .filter((s) => s.endsWith('USDT'))
      : prev.symbols,
    leverage: Math.max(
      1,
      Math.min(125, Number(patch.leverage ?? prev.leverage) || 50)
    ),
    marginUsdt: Math.max(1, Number(patch.marginUsdt ?? prev.marginUsdt) || 10),
    updatedAt: Date.now(),
    updatedBy: patch.updatedBy || prev.updatedBy,
  };
  if (!next.symbols.length) next.symbols = [...DEFAULT.symbols];
  ensureDir();
  fs.writeFileSync(FILE, JSON.stringify(next, null, 2), 'utf8');
  return next;
}

export function ppServerEntryReady(arm?: PpServerArmState): boolean {
  const a = arm || readPpServerArm();
  return Boolean(a.liveArmed && a.symbols.length);
}
