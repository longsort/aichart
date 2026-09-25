/**
 * 마감·안착 — 깔끔 zone·line 차트: 카드·글자 없이
 * 존 터치 + 고합류 롱/숏만 캔들 위·아래 ▲/▼ 아이콘.
 */
import type { Candle, OverlayItem } from '@/types';
import type { UTCTimestamp } from 'lightweight-charts';
import type { MonthDeskBandFusionContext } from '@/lib/institutionalSuperBand';
import type { MonthDeskStrikeDeskBundle } from '@/lib/monthDeskStrikeDesk';
import { normalizeChartTimeframe } from '@/lib/constants';

export type MonthDeskCleanIconMarker = {
  time: UTCTimestamp;
  position: 'aboveBar' | 'belowBar';
  shape: 'square' | 'circle';
  color: string;
  text: string;
  size: 1 | 2 | 3;
  id: string;
};

export type MonthDeskCleanIconContext = {
  fusion: MonthDeskBandFusionContext | null;
  fusionScores?: number[];
  bandTouchByTime?: Map<number, Array<{ verdict: 'LONG' | 'SHORT'; tier?: 'A' | 'B' | 'C' }>>;
};

const MIN_SCORE_A = 6.2;
const MIN_SCORE_B = 4.8;

function minGapBars(tf: string): number {
  const t = normalizeChartTimeframe(tf);
  if (t === '1m' || t === '5m') return 8;
  if (t === '15m' || t === '1h') return 6;
  return 5;
}

function scanBars(tf: string): number {
  const t = normalizeChartTimeframe(tf);
  if (t === '1M' || t === '1w') return 80;
  if (t === '1d' || t === '4h') return 120;
  return 160;
}

function rocketBump(
  fusion: MonthDeskBandFusionContext | null,
  barTime: number,
  dir: 'LONG' | 'SHORT'
): number {
  if (!fusion?.rocketByBarTime || !Number.isFinite(barTime)) return 0;
  const rk = fusion.rocketByBarTime.get(barTime);
  if (rk === dir) return 3.1;
  if (rk && rk !== dir) return -1.2;
  return 0;
}

function bandTouchBump(
  ctx: MonthDeskCleanIconContext,
  barTime: number,
  dir: 'LONG' | 'SHORT'
): number {
  const evs = ctx.bandTouchByTime?.get(barTime);
  if (!evs?.length) return 0;
  let bump = 0;
  for (const ev of evs) {
    if (ev.verdict !== dir) continue;
    bump += ev.tier === 'A' ? 2.4 : ev.tier === 'B' ? 1.6 : 1.1;
  }
  return bump;
}

function scoreLongTouch(
  candles: Candle[],
  i: number,
  zoneTop: number,
  zoneBot: number,
  ctx: MonthDeskCleanIconContext
): number {
  const c = candles[i];
  const prev = i > 0 ? candles[i - 1] : null;
  const low = Number(c.low);
  const close = Number(c.close);
  const open = Number(c.open);
  const h = zoneTop - zoneBot;
  if (!Number.isFinite(low) || h <= 0) return 0;

  const touch = low <= zoneTop && low >= zoneBot - h * 0.18;
  if (!touch) return 0;

  let s = 1.6;
  const mid = zoneBot + h * 0.42;
  if (close >= open) s += 1.4;
  if (close >= mid) s += 1.2;
  const body = Math.max(Math.abs(close - open), 1e-9);
  const lowerWick = Math.min(open, close) - low;
  if (lowerWick / body >= 0.42) s += 1.5;
  if (prev && Number(prev.low) > zoneTop) s += 0.9;

  const bt = Number(c.time);
  s += rocketBump(ctx.fusion, bt, 'LONG');
  s += bandTouchBump(ctx, bt, 'LONG');

  const fs = ctx.fusionScores?.[i];
  if (fs != null && fs > 0.35) s += Math.min(2.2, fs * 0.55);

  const struct = ctx.fusion?.structureByTime?.get(bt);
  if (struct && struct.phase !== 'failed' && struct.bias === 'bullish') {
    s += struct.phase === 'confirmed' ? 2 : struct.phase === 'settling' ? 1.4 : 0.9;
  }

  return s;
}

function scoreShortTouch(
  candles: Candle[],
  i: number,
  zoneTop: number,
  zoneBot: number,
  ctx: MonthDeskCleanIconContext
): number {
  const c = candles[i];
  const prev = i > 0 ? candles[i - 1] : null;
  const high = Number(c.high);
  const close = Number(c.close);
  const open = Number(c.open);
  const h = zoneTop - zoneBot;
  if (!Number.isFinite(high) || h <= 0) return 0;

  const touch = high >= zoneBot && high <= zoneTop + h * 0.18;
  if (!touch) return 0;

  let s = 1.6;
  const mid = zoneBot + h * 0.58;
  if (close <= open) s += 1.4;
  if (close <= mid) s += 1.2;
  const body = Math.max(Math.abs(close - open), 1e-9);
  const upperWick = high - Math.max(open, close);
  if (upperWick / body >= 0.42) s += 1.5;
  if (prev && Number(prev.high) < zoneBot) s += 0.9;

  const bt = Number(c.time);
  s += rocketBump(ctx.fusion, bt, 'SHORT');
  s += bandTouchBump(ctx, bt, 'SHORT');

  const fs = ctx.fusionScores?.[i];
  if (fs != null && fs < -0.35) s += Math.min(2.2, Math.abs(fs) * 0.55);

  const struct = ctx.fusion?.structureByTime?.get(bt);
  if (struct && struct.phase !== 'failed' && struct.bias === 'bearish') {
    s += struct.phase === 'confirmed' ? 2 : struct.phase === 'settling' ? 1.4 : 0.9;
  }

  return s;
}

function pushCandidate(
  out: Array<{ time: number; dir: 'LONG' | 'SHORT'; score: number; i: number }>,
  time: number,
  dir: 'LONG' | 'SHORT',
  score: number,
  i: number
) {
  if (score < MIN_SCORE_B) return;
  out.push({ time, dir, score, i });
}

function toMarker(
  c: { time: number; dir: 'LONG' | 'SHORT'; score: number; i: number },
  hot: boolean
): MonthDeskCleanIconMarker {
  const isLong = c.dir === 'LONG';
  const tierA = c.score >= MIN_SCORE_A;
  return {
    time: c.time as UTCTimestamp,
    position: isLong ? 'belowBar' : 'aboveBar',
    shape: tierA ? 'square' : 'circle',
    color: isLong ? (tierA ? '#22C55E' : '#4ade80') : tierA ? '#EF4444' : '#f87171',
    text: isLong ? '▲' : '▼',
    size: hot || tierA ? 2 : 1,
    id: `month-desk-clean-icon-${isLong ? 'l' : 's'}-${c.time}`,
  };
}

/** 마지막 봉만 ▲/▼ — 통합엔진·아틀라스용 (전구간 스캔 생략) */
export function buildMonthDeskLastBarCleanIconMarkers(params: {
  candles: Candle[];
  timeframe: string;
  strikeBundle: MonthDeskStrikeDeskBundle | null;
  ctx: MonthDeskCleanIconContext;
}): MonthDeskCleanIconMarker[] {
  const { candles, strikeBundle, ctx } = params;
  const n = candles.length;
  if (n < 12 || !strikeBundle) return [];
  const lastI = n - 1;
  const t = Number(candles[lastI]?.time);
  if (!Number.isFinite(t)) return [];

  const longLeg = strikeBundle.long;
  const shortLeg = strikeBundle.short;
  const raw: Array<{ time: number; dir: 'LONG' | 'SHORT'; score: number; i: number }> = [];

  if (longLeg) {
    const ls = scoreLongTouch(candles, lastI, longLeg.zoneTop, longLeg.zoneBot, ctx);
    const bump = strikeBundle.primary === 'LONG' && strikeBundle.ai?.long?.phase === 'hot' ? 1.2 : 0;
    pushCandidate(raw, t, 'LONG', ls + bump, lastI);
  }
  if (shortLeg) {
    const ss = scoreShortTouch(candles, lastI, shortLeg.zoneTop, shortLeg.zoneBot, ctx);
    const bump = strikeBundle.primary === 'SHORT' && strikeBundle.ai?.short?.phase === 'hot' ? 1.2 : 0;
    pushCandidate(raw, t, 'SHORT', ss + bump, lastI);
  }

  raw.sort((a, b) => b.score - a.score);
  const best = raw[0];
  if (!best || best.score < MIN_SCORE_B) return [];
  const hot =
    strikeBundle.ai?.phase === 'hot' ||
    (best.dir === 'LONG' ? strikeBundle.ai?.long?.phase === 'hot' : strikeBundle.ai?.short?.phase === 'hot');
  return [toMarker(best, hot || true)];
}

/** 존 터치 + 합류 점수 — 차트 캔들 ▲/▼ (글자·카드 없음) */
export function buildMonthDeskCleanIconMarkers(params: {
  candles: Candle[];
  timeframe: string;
  strikeBundle: MonthDeskStrikeDeskBundle | null;
  ctx: MonthDeskCleanIconContext;
}): MonthDeskCleanIconMarker[] {
  const { candles, timeframe, strikeBundle, ctx } = params;
  const n = candles.length;
  if (n < 12 || !strikeBundle) return [];

  const longLeg = strikeBundle.long;
  const shortLeg = strikeBundle.short;
  const start = Math.max(1, n - scanBars(timeframe));
  const raw: Array<{ time: number; dir: 'LONG' | 'SHORT'; score: number; i: number }> = [];

  for (let i = start; i < n; i++) {
    const t = Number(candles[i].time);
    if (!Number.isFinite(t)) continue;
    if (longLeg) {
      const ls = scoreLongTouch(candles, i, longLeg.zoneTop, longLeg.zoneBot, ctx);
      if (strikeBundle.primary === 'LONG' && strikeBundle.ai?.long?.phase === 'hot') {
        pushCandidate(raw, t, 'LONG', ls + 1.2, i);
      } else {
        pushCandidate(raw, t, 'LONG', ls, i);
      }
    }
    if (shortLeg) {
      const ss = scoreShortTouch(candles, i, shortLeg.zoneTop, shortLeg.zoneBot, ctx);
      if (strikeBundle.primary === 'SHORT' && strikeBundle.ai?.short?.phase === 'hot') {
        pushCandidate(raw, t, 'SHORT', ss + 1.2, i);
      } else {
        pushCandidate(raw, t, 'SHORT', ss, i);
      }
    }
  }

  raw.sort((a, b) => b.score - a.score || b.i - a.i);
  const gap = minGapBars(timeframe);
  const picked: typeof raw = [];
  const usedTimes = new Set<number>();

  for (const c of raw) {
    if (usedTimes.has(c.time)) continue;
    let clash = false;
    for (const p of picked) {
      if (p.dir !== c.dir) continue;
      if (Math.abs(p.i - c.i) < gap) {
        clash = true;
        break;
      }
    }
    if (clash) continue;
    picked.push(c);
    usedTimes.add(c.time);
    if (picked.length >= 24) break;
  }

  picked.sort((a, b) => a.i - b.i);
  const lastI = n - 1;
  const lastT = Number(candles[lastI]?.time);
  return picked.map((c) => {
    const hot = c.i === lastI || c.i === lastI - 1;
    return toMarker(c, hot);
  });
}

/** 카드·핀·라벨 제거 — zone 면·수평 line 색만 유지 */
export function applyMonthDeskCleanIconOverlayStrip(items: OverlayItem[]): OverlayItem[] {
  return items
    .filter((o) => String(o.kind || '') !== 'label')
    .map((o) => {
      const id = String(o.id || '');
      if (id.startsWith('month-desk-signal-') || id.startsWith('month-desk-pin-')) {
        return null;
      }
      const next: OverlayItem = { ...o, label: '' };
      if ('lineLabel' in next) (next as { lineLabel?: string }).lineLabel = '';
      if ('labelTooltip' in next && id.startsWith('month-desk-strike-')) {
        (next as { labelTooltip?: string }).labelTooltip = '';
      }
      return next;
    })
    .filter((o): o is OverlayItem => o != null);
}

export function isMonthDeskCleanIconPreservedChartMarker(m: { text?: string }): boolean {
  const tx = String(m.text ?? '').trim();
  if (!tx) return false;
  if (tx === '🚀' || tx === '📉' || tx.includes('🚀') || tx.includes('📉')) return true;
  if (/^[⚡]?[LS][HP]?[★◆·]$/.test(tx)) return true;
  if (tx === '▲' || tx === '▼') return true;
  return false;
}
