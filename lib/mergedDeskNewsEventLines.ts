/**
 * FF 고영향 뉴스 → 차트 세로선 + 마커 (캔들 시간 스냅).
 * HUD 카드 아님.
 */
import type { Candle, OverlayItem } from '@/types';
import type { AtlasPulseMarker } from '@/lib/monthDeskAtlasPulseDesk';
import type { UTCTimestamp } from 'lightweight-charts';

export type MergedDeskNewsEventIn = {
  title?: string;
  timeMs?: number;
  symbols?: string[];
};

function toCandleUnit(timeMs: number, sample: number): number {
  return sample > 1e12 ? timeMs : Math.floor(timeMs / 1000);
}

function snapCandleTime(candles: Candle[], timeMs: number): number | null {
  if (!candles.length || !Number.isFinite(timeMs) || timeMs <= 0) return null;
  const target = toCandleUnit(timeMs, Number(candles[0]!.time));
  let best = candles[0]!.time;
  let bestD = Math.abs(best - target);
  for (let i = 1; i < candles.length; i++) {
    const t = candles[i]!.time;
    const d = Math.abs(t - target);
    if (d < bestD) {
      best = t;
      bestD = d;
    }
  }
  const span = Math.max(60, Number(candles[candles.length - 1]!.time) - Number(candles[0]!.time));
  const maxSlack = sampleIsMs(Number(candles[0]!.time)) ? 8 * 60 * 60 * 1000 : 8 * 60 * 60;
  if (bestD > span * 0.35 && bestD > maxSlack) return null;
  return best;
}

function sampleIsMs(t: number): boolean {
  return t > 1e12;
}

function shortTitle(title: string): string {
  const t = String(title || '').replace(/\s+/g, ' ').trim();
  if (/cpi/i.test(t)) return 'CPI';
  if (/pce/i.test(t)) return 'PCE';
  if (/nfp|payroll|nonfarm/i.test(t)) return 'NFP';
  if (/fomc|fed funds|rate decision/i.test(t)) return 'FOMC';
  if (/ppi/i.test(t)) return 'PPI';
  if (/gdp/i.test(t)) return 'GDP';
  return (t || '뉴스').slice(0, 12);
}

function rangeHiLo(candles: Candle[]): { hi: number; lo: number } {
  let hi = -Infinity;
  let lo = Infinity;
  const start = Math.max(0, candles.length - 180);
  for (let i = start; i < candles.length; i++) {
    const c = candles[i]!;
    if (c.high > hi) hi = c.high;
    if (c.low < lo) lo = c.low;
  }
  if (!Number.isFinite(hi) || !Number.isFinite(lo) || hi <= lo) {
    const last = candles[candles.length - 1]!;
    return { hi: last.high * 1.01, lo: last.low * 0.99 };
  }
  const pad = (hi - lo) * 0.04;
  return { hi: hi + pad, lo: lo - pad };
}

export function buildMergedDeskNewsEventDraw(
  candles: Candle[],
  events: MergedDeskNewsEventIn[] | null | undefined,
  symbol?: string
): { overlays: OverlayItem[]; markers: AtlasPulseMarker[] } {
  const overlays: OverlayItem[] = [];
  const markers: AtlasPulseMarker[] = [];
  if (!candles.length || !events?.length) return { overlays, markers };

  const { hi, lo } = rangeHiLo(candles);
  const seenT = new Set<number>();
  void symbol;

  for (const ev of events) {
    const title = String(ev.title || '').trim();
    const timeMs = Number(ev.timeMs);
    if (!title || !Number.isFinite(timeMs)) continue;
    const t = snapCandleTime(candles, timeMs);
    if (t == null || seenT.has(t)) continue;
    seenT.add(t);
    const short = shortTitle(title);
    const id = `merged-desk-news-${t}`;
    overlays.push({
      id,
      kind: 'trendLine',
      label: short,
      x1: 0,
      y1: 0,
      time1: t,
      time2: t,
      price1: lo,
      price2: hi,
      confidence: 0.5,
      color: 'rgba(56,189,248,0.55)',
      lineDash: '3 5',
      lineStrokeWidth: 1,
      noProject: true,
      overlayZoneExtraClass: 'merged-desk-news-event merged-desk-trendline-keep',
      labelTooltip: `${title} · 매크로 일정(조건부)`,
    });
    markers.push({
      time: t as UTCTimestamp,
      position: 'aboveBar',
      shape: 'square',
      color: '#38bdf8',
      text: short,
      size: 1,
      id: `${id}-mk`,
    });
    if (overlays.length >= 8) break;
  }
  return { overlays, markers };
}
