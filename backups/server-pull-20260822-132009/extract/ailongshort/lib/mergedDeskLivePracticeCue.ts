/**
 * 실전 연습 큐 — 자동매매 없이 “지금이면 금지/지정가/E체결후보”.
 * ActiveTrade 한 소스. 확정 수익·주문 실행 아님.
 */
import type { Candle, OverlayItem } from '@/types';
import type { MergedDeskActiveTradePlan } from '@/lib/mergedDeskActiveTradePlan';
import { mergedDeskRiskSizeHintKo } from '@/lib/mergedDeskEntryHardGates';
import type { MasterFuturesDecision } from '@/lib/mergedDeskMasterFuturesDecision';

export type LivePracticeMode = 'block' | 'limit-wait' | 'fill-candidate';

export type MergedDeskLivePracticeCue = {
  mode: LivePracticeMode;
  tagKo: string;
  lineKo: string;
  detailKo: string;
  triggerKo: string;
  side: 'LONG' | 'SHORT' | 'WAIT';
  entry: number;
  stop: number;
  inv: number;
  sizeKo: string;
};

function fmt(p: number): string {
  if (!(p > 0) || !Number.isFinite(p)) return '—';
  if (p >= 1000) return p.toFixed(0);
  if (p >= 1) return p.toFixed(1);
  return p.toFixed(4);
}

function nearEntry(price: number, entry: number, last: Candle | null): boolean {
  if (!(price > 0) || !(entry > 0)) return false;
  if (Math.abs(price - entry) / entry <= 0.0025) return true;
  if (!last) return false;
  const hi = Number(last.high);
  const lo = Number(last.low);
  if (![hi, lo].every((x) => Number.isFinite(x) && x > 0)) return false;
  return lo <= entry && entry <= hi;
}

export function buildMergedDeskLivePracticeCue(params: {
  plan: MergedDeskActiveTradePlan | null | undefined;
  price: number | null | undefined;
  lastCandle?: Candle | null;
  master?: MasterFuturesDecision | null;
}): MergedDeskLivePracticeCue {
  const plan = params.plan;
  const price = Number(params.price) || 0;
  const last = params.lastCandle ?? null;
  const sizeKo =
    params.master?.sizing?.sizingKo?.trim() ||
    (plan && plan.entry > 0 && plan.stopLoss > 0
      ? mergedDeskRiskSizeHintKo(plan.entry, plan.stopLoss)
      : '참고 1R≈계좌1% · 확정 아님');

  if (!plan || plan.direction === 'NEUTRAL' || !(plan.entry > 0)) {
    return {
      mode: 'block',
      tagKo: '금지',
      lineKo: '실전 · 자동이면 주문 금지 · 플랜 없음',
      detailKo: 'ActiveTrade 대기. 확정 아님.',
      triggerKo: '관망',
      side: 'WAIT',
      entry: 0,
      stop: 0,
      inv: 0,
      sizeKo,
    };
  }

  const side = plan.direction;
  const dirKo = side === 'LONG' ? '롱' : '숏';
  const inv = plan.invalidationPrice > 0 ? plan.invalidationPrice : plan.stopLoss;
  const warn = (plan.asUnifiedPlan.warningsKo ?? []).slice(0, 2).join(' · ');

  if (plan.status === 'INVALID') {
    return {
      mode: 'block',
      tagKo: '금지',
      lineKo: `실전 · ${dirKo} 무효 · 재진입 금지 · 무효 ${fmt(inv)}`,
      detailKo: plan.invalidationKo || '종가 무효 이탈',
      triggerKo: 'INVALID',
      side,
      entry: plan.entry,
      stop: plan.stopLoss,
      inv,
      sizeKo,
    };
  }

  if (!plan.entryAllowed || plan.status === 'WAIT') {
    return {
      mode: 'block',
      tagKo: '금지',
      lineKo: `실전 · 자동이면 주문 금지 · ${plan.statusKo}${warn ? ` · ${warn}` : ''}`,
      detailKo: '안착·MTF·뉴스·마스터 게이트 미통과. 차트만 관찰.',
      triggerKo: plan.statusKo,
      side,
      entry: plan.entry,
      stop: plan.stopLoss,
      inv,
      sizeKo,
    };
  }

  const touched = nearEntry(price, plan.entry, last);
  if (plan.status === 'ENTER' && plan.entryAllowed && touched) {
    return {
      mode: 'fill-candidate',
      tagKo: 'E체결후보',
      lineKo: `실전 · ${dirKo} E ${fmt(plan.entry)} 체결후보 · SL ${fmt(plan.stopLoss)} · ${sizeKo}`,
      detailKo: '수동 연습: 이 가격 근처만. 자동주문 아님 · 확정 수익 아님.',
      triggerKo: 'ENTER+가격접촉',
      side,
      entry: plan.entry,
      stop: plan.stopLoss,
      inv,
      sizeKo,
    };
  }

  return {
    mode: 'limit-wait',
    tagKo: '지정가대기',
    lineKo: `실전 · ${dirKo} 지정가 E ${fmt(plan.entry)} 대기 · 지금가 ${price > 0 ? fmt(price) : '—'} · SL ${fmt(plan.stopLoss)}`,
    detailKo: plan.status === 'TOUCH' ? '레일 터치 · 안착 전. 시장가 금지.' : 'ENTER이나 아직 E 미접촉. 지정가만.',
    triggerKo: plan.status === 'TOUCH' ? 'TOUCH' : 'ENTER·미접촉',
    side,
    entry: plan.entry,
    stop: plan.stopLoss,
    inv,
    sizeKo,
  };
}

export function buildMergedDeskLivePracticeOverlay(
  cue: MergedDeskLivePracticeCue,
  candles: Candle[]
): OverlayItem | null {
  const n = candles.length;
  if (n < 2) return null;
  const last = candles[n - 1]!;
  const t = Number(last.time);
  const px = cue.entry > 0 ? cue.entry : Number(last.close);
  if (!(t > 0) || !(px > 0)) return null;
  const fill = cue.mode === 'fill-candidate';
  const wait = cue.mode === 'limit-wait';
  return {
    id: 'merged-desk-live-practice-cue',
    kind: 'label',
    category: 'chartPrimeTrendChannels',
    label: `실전·${cue.tagKo}`,
    x1: 0,
    y1: 0,
    time1: t,
    price1: px,
    confidence: fill ? 88 : wait ? 70 : 50,
    color: fill ? '#86efac' : wait ? '#fde68a' : '#94a3b8',
    labelBackgroundColor: fill ? 'rgba(20,83,45,0.94)' : wait ? 'rgba(69,48,12,0.94)' : 'rgba(30,41,59,0.94)',
    labelTextColor: fill ? '#ecfdf5' : wait ? '#fefce8' : '#e2e8f0',
    overlayZoneExtraClass: [
      'merged-desk-rb-signal-pin',
      'merged-desk-live-practice-pin',
      `merged-desk-live-practice--${cue.mode}`,
    ].join(' '),
    labelTooltip: `${cue.lineKo}\n${cue.detailKo}\n자동주문 아님`,
    noProject: true,
  };
}

const LOG_KEY = 'ailongshort-live-practice-log-v1';

export type LivePracticeLogRow = {
  at: number;
  symbol: string;
  timeframe: string;
  mode: LivePracticeMode;
  side: string;
  entry: number;
  stop: number;
  price: number;
  lineKo: string;
};

export function appendLivePracticeLog(row: Omit<LivePracticeLogRow, 'at'>): void {
  if (typeof window === 'undefined') return;
  try {
    const prev = JSON.parse(window.localStorage.getItem(LOG_KEY) || '[]') as LivePracticeLogRow[];
    const next = [{ ...row, at: Date.now() }, ...(Array.isArray(prev) ? prev : [])].slice(0, 80);
    window.localStorage.setItem(LOG_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

export function readLivePracticeLog(): LivePracticeLogRow[] {
  if (typeof window === 'undefined') return [];
  try {
    const prev = JSON.parse(window.localStorage.getItem(LOG_KEY) || '[]') as LivePracticeLogRow[];
    return Array.isArray(prev) ? prev : [];
  } catch {
    return [];
  }
}
