'use client';

/**
 * 통합·분석 데스크 — 확정 스냅샷 trade-learning 동기화 (로컬 + 서버).
 * 조건부 참고 — 확정 수익·투자 권유 아님.
 */
import type { MergedTradeJudgment } from '@/lib/mergedAnalysisTradeJudgment';
import type { MergedDirectionConfirm } from '@/lib/mergedAnalysisDirectionConfirm';
import { loadLearningState, type LearningState } from '@/lib/unifiedTrade';

const MERGED_SNAPSHOT_KEY = 'ailongshort-merged-desk-snapshot-v1';

export type MergedDeskTradeSnapshot = {
  at: number;
  symbol: string;
  timeframe: string;
  direction: 'LONG' | 'SHORT' | 'NEUTRAL';
  gatesPassCount: number;
  judgmentHeadline: string;
  entry: number;
  stopLoss: number;
  tp1: number;
};

let lastPersistMs = 0;

function loadSnapshots(): MergedDeskTradeSnapshot[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(MERGED_SNAPSHOT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as MergedDeskTradeSnapshot[];
    return Array.isArray(parsed) ? parsed.slice(0, 48) : [];
  } catch {
    return [];
  }
}

function saveSnapshots(items: MergedDeskTradeSnapshot[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(MERGED_SNAPSHOT_KEY, JSON.stringify(items.slice(0, 48)));
  } catch {}
}

function persistMergedToServer(state: LearningState, force = false): void {
  if (typeof window === 'undefined') return;
  const now = Date.now();
  if (!force && now - lastPersistMs < 20_000) return;
  lastPersistMs = now;
  void fetch('/api/trade-learning', {
    method: 'PUT',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ state }),
  }).catch(() => {});
}

/** 확정 tier 또는 gates≥4 변경 시 스냅샷 기록 */
export function logMergedDeskTradeLearning(params: {
  symbol: string;
  timeframe: string;
  judgment: MergedTradeJudgment;
  confirms: MergedDirectionConfirm[];
  entry: number;
  stopLoss: number;
  tp1: number;
}): void {
  if (typeof window === 'undefined') return;

  const top = params.confirms.find((c) => c.tier === 'confirmed') ?? params.confirms[0];
  const gatesPassCount = top?.gatesPassCount ?? 0;
  const shouldLog = top?.tier === 'confirmed' || gatesPassCount >= 4;
  if (!shouldLog) return;

  const snap: MergedDeskTradeSnapshot = {
    at: Date.now(),
    symbol: params.symbol,
    timeframe: params.timeframe,
    direction: params.judgment.direction,
    gatesPassCount,
    judgmentHeadline: params.judgment.headlineKo,
    entry: params.entry,
    stopLoss: params.stopLoss,
    tp1: params.tp1,
  };

  const prev = loadSnapshots()[0];
  if (
    prev &&
    prev.symbol === snap.symbol &&
    prev.timeframe === snap.timeframe &&
    prev.direction === snap.direction &&
    prev.gatesPassCount === snap.gatesPassCount &&
    Date.now() - prev.at < 45_000
  ) {
    return;
  }

  saveSnapshots([snap, ...loadSnapshots()]);

  const state = loadLearningState();
  const mergedMeta = {
    ...(state as LearningState & { mergedDeskSnapshots?: MergedDeskTradeSnapshot[] }),
    mergedDeskSnapshots: [snap, ...loadSnapshots()].slice(0, 24),
  };
  persistMergedToServer(mergedMeta as LearningState, gatesPassCount >= 5);
}

export function loadMergedDeskSnapshots(): MergedDeskTradeSnapshot[] {
  return loadSnapshots();
}
