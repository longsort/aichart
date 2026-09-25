/**
 * §35 PAPER→LIVE 승격 게이트.
 * BACKTEST→OOS→PAPER→SMALL LIVE→NORMAL LIVE.
 * 통계는 data/tapoint-accum 에 영속 (재시작 유지).
 * 서버 전용 — 클라이언트에서 import 금지.
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  resolveUltraTradingMode,
  type UltraTradingMode,
} from '@/lib/doksuri1/ultraScalpEngine';
import { summarizeTapRejectStats } from './rejectLedgerWire';

export type TapPromotionStage =
  | 'BACKTEST'
  | 'OOS'
  | 'PAPER'
  | 'SMALL_LIVE'
  | 'NORMAL_LIVE'
  | 'BLOCKED';

export type TapPaperLiveGate = {
  stage: TapPromotionStage;
  tradingMode: UltraTradingMode;
  liveAllowed: boolean;
  paperOnly: boolean;
  noteKo: string;
  reasons: string[];
};

type PaperStats = { confirmed: number; rejects: number; updatedAt: number };
type OosSnap = { holdoutPf: number | null; holdoutNetEv: number | null; n: number };

const g = globalThis as unknown as {
  __tapPaperStats?: PaperStats;
  __tapOosSnap?: OosSnap;
  __tapPaperPersistLoaded?: boolean;
};

const REL = path.join('data', 'tapoint-accum', 'paper-live-gate.json');

function abs(): string {
  return path.join(process.cwd(), REL);
}

function loadPersist(): void {
  if (g.__tapPaperPersistLoaded) return;
  g.__tapPaperPersistLoaded = true;
  if (typeof window !== 'undefined') return;
  try {
    const raw = fs.readFileSync(abs(), 'utf8');
    const j = JSON.parse(raw) as {
      paper?: PaperStats;
      oos?: OosSnap;
    };
    if (j.paper && Number.isFinite(j.paper.confirmed)) {
      g.__tapPaperStats = {
        confirmed: Math.max(0, Math.floor(j.paper.confirmed)),
        rejects: Math.max(0, Math.floor(j.paper.rejects || 0)),
        updatedAt: Number(j.paper.updatedAt) || Date.now(),
      };
    }
    if (j.oos) {
      g.__tapOosSnap = {
        holdoutPf: j.oos.holdoutPf ?? null,
        holdoutNetEv: j.oos.holdoutNetEv ?? null,
        n: Math.max(0, Math.floor(j.oos.n || 0)),
      };
    }
  } catch {
    /* ENOENT or parse — 빈 상태로 시작 */
  }
}

function savePersist(): void {
  if (typeof window !== 'undefined') return;
  try {
    const dir = path.dirname(abs());
    fs.mkdirSync(dir, { recursive: true });
    const payload = {
      updatedAt: Date.now(),
      paper: g.__tapPaperStats || { confirmed: 0, rejects: 0, updatedAt: 0 },
      oos: g.__tapOosSnap || { holdoutPf: null, holdoutNetEv: null, n: 0 },
    };
    fs.writeFileSync(abs(), JSON.stringify(payload, null, 2), 'utf8');
  } catch {
    /* ignore disk errors */
  }
}

export function bumpTapPaperStats(kind: 'confirmed' | 'reject'): void {
  loadPersist();
  if (!g.__tapPaperStats) {
    g.__tapPaperStats = { confirmed: 0, rejects: 0, updatedAt: Date.now() };
  }
  if (kind === 'confirmed') g.__tapPaperStats.confirmed += 1;
  else g.__tapPaperStats.rejects += 1;
  g.__tapPaperStats.updatedAt = Date.now();
  savePersist();
}

export function updateTapOosSnap(params: {
  holdoutPf: number | null;
  holdoutNetEv: number | null;
  n: number;
}): void {
  loadPersist();
  g.__tapOosSnap = {
    holdoutPf: params.holdoutPf,
    holdoutNetEv: params.holdoutNetEv,
    n: params.n,
  };
  savePersist();
}

export function evaluateTapPaperLiveGate(params: {
  enabled?: boolean;
  liveArmed?: boolean;
  tradingMode?: UltraTradingMode | null;
  promoteRequest?: boolean;
}): TapPaperLiveGate {
  loadPersist();
  const enabled = params.enabled !== false;
  const liveArmed = params.liveArmed === true;
  const mode = resolveUltraTradingMode({
    enabled,
    liveArmed,
    tradingMode: params.tradingMode ?? 'PAPER',
  });

  const stats = g.__tapPaperStats || { confirmed: 0, rejects: 0, updatedAt: 0 };
  const oos = g.__tapOosSnap || { holdoutPf: null, holdoutNetEv: null, n: 0 };
  const miss = summarizeTapRejectStats();
  const reasons: string[] = [];

  const minPaper = 30;
  if (stats.confirmed < minPaper) {
    reasons.push(`페이퍼확정 ${stats.confirmed}/${minPaper}`);
  }
  if (oos.n < 30 || oos.holdoutPf == null || oos.holdoutPf < 1.05) {
    reasons.push(
      `OOS PF ${oos.holdoutPf != null ? oos.holdoutPf.toFixed(2) : '—'} (필요≥1.05 · N≥30)`
    );
  }
  if (oos.holdoutNetEv != null && oos.holdoutNetEv <= 0) {
    reasons.push('OOS NET EV≤0');
  }
  if (miss.missedWinner > miss.goodRejection * 2 && miss.missedWinner >= 5) {
    reasons.push(`필터과다 · 놓친승${miss.missedWinner}`);
  }

  let stage: TapPromotionStage = 'PAPER';
  let liveAllowed = false;
  let paperOnly = true;

  if (!enabled || mode === 'OFF') {
    stage = 'BLOCKED';
    reasons.push('엔진 OFF');
  } else if (mode === 'SIGNAL_ONLY' || mode === 'SHADOW') {
    stage = 'OOS';
  } else if (mode === 'PAPER' || !liveArmed) {
    stage = stats.confirmed >= 10 ? 'PAPER' : 'BACKTEST';
    if (!liveArmed) reasons.push('liveArmed 아님');
  } else if (mode === 'LIVE' && liveArmed) {
    if (reasons.length > 0) {
      stage = 'PAPER';
      liveAllowed = false;
      paperOnly = true;
    } else if (params.promoteRequest) {
      stage = stats.confirmed >= 80 && (oos.holdoutPf || 0) >= 1.2 ? 'NORMAL_LIVE' : 'SMALL_LIVE';
      liveAllowed = true;
      paperOnly = false;
      reasons.push(`승격 ${stage}`);
    } else {
      stage = 'PAPER';
      reasons.push('승격요청 없음 · PAPER유지');
    }
  }

  return {
    stage,
    tradingMode: mode,
    liveAllowed,
    paperOnly,
    noteKo: reasons.length ? reasons.join(' · ') : '승격조건 충족',
    reasons,
  };
}
