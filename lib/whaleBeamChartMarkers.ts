/**
 * Bitget 고래 DNA — 캔들·거래량 시리즈 마커 (SVG 랜스 보조)
 */
import type { UTCTimestamp } from 'lightweight-charts';
import type { Candle } from '@/types';
import type { VolumePanelMarker } from '@/lib/volumeHistogramIntelligence';
import type { WhaleSegmentVolumeSignal } from '@/lib/whaleVolumeSegmentSignals';

export type WhaleCandleMarker = {
  time: UTCTimestamp;
  position: 'aboveBar' | 'belowBar';
  shape: 'arrowUp' | 'arrowDown' | 'circle';
  color: string;
  text: string;
  size: 1 | 2 | 3;
};

function dirOf(s: WhaleSegmentVolumeSignal): 'long' | 'short' | 'neutral' {
  if (s.verdictKo === '상승' || s.move.dir === 'long') return 'long';
  if (s.verdictKo === '하락' || s.move.dir === 'short') return 'short';
  return 'neutral';
}

function candleAtTime(candles: Candle[], t: number): Candle | null {
  for (let i = candles.length - 1; i >= 0; i--) {
    const ct = Number(candles[i]!.time);
    if (ct === t) return candles[i]!;
    if (ct < t) return candles[i] ?? null;
  }
  return candles[0] ?? null;
}

function candlesInTimeRange(candles: Candle[], tFrom: number, tTo: number): Candle[] {
  const lo = Math.min(tFrom, tTo);
  const hi = Math.max(tFrom, tTo);
  return candles.filter((c) => {
    const t = Number(c.time);
    return t >= lo && t <= hi;
  });
}

function beamVolLabel(s: WhaleSegmentVolumeSignal): string {
  const d = dirOf(s);
  const pct = s.move.pctLabel ?? '';
  if (s.beamKo === '롱빔') return `▲BEAM${pct}`;
  if (s.beamKo === '숏빔') return `▼BEAM${pct}`;
  const arrow = d === 'long' ? '▲' : d === 'short' ? '▼' : '·';
  const tier = s.move.tierLabel ?? '';
  return `${arrow}${tier}${pct}`.replace(/\s+/g, '').slice(0, 14);
}

/** 캔들 — SVG 랜스 없을 때만 화살 (글자 없음) */
export function buildWhaleBeamCandleMarkers(
  signals: WhaleSegmentVolumeSignal[],
  candles: Candle[]
): WhaleCandleMarker[] {
  if (!candles.length || !signals.length) return [];
  const lastT = Number(candles[candles.length - 1]!.time);
  const out: WhaleCandleMarker[] = [];

  for (const s of signals) {
    const d = dirOf(s);
    if (d === 'neutral' && s.beamKo === '관망') continue;
    const breakT = Number(s.timeBoxTo ?? s.timeTo);
    const breakC = candleAtTime(candles, breakT);
    if (!breakC) continue;
    if (s.isLive && breakT >= lastT) continue;

    out.push({
      time: breakC.time as UTCTimestamp,
      position: d === 'short' ? 'aboveBar' : 'belowBar',
      shape: d === 'long' ? 'arrowUp' : 'arrowDown',
      color: s.move.color,
      text: '',
      size: s.isLive ? 2 : 1,
    });
  }
  return out;
}

/** 거래량 막대 — ▲BEAM / ▼BEAM (막대 위) */
export function buildWhaleBeamVolumeMarkers(
  signals: WhaleSegmentVolumeSignal[],
  candles: Candle[]
): VolumePanelMarker[] {
  if (!candles.length || !signals.length) return [];
  const out: VolumePanelMarker[] = [];
  const labelOf = beamVolLabel;

  for (const s of signals) {
    const label = labelOf(s);
    const tFrom = Number(s.timeVolFrom ?? s.timeFrom);
    const tTo = Number(s.timeVolTo ?? s.timeVol);
    const cluster = candlesInTimeRange(candles, tFrom, tTo);
    const peakT = Number(s.timeVol);

    if (s.isLive) {
      const lastT = Number(candles[candles.length - 1]!.time);
      for (const c of cluster) {
        const t = Number(c.time);
        if (t >= lastT) continue;
        out.push({
          time: c.time as UTCTimestamp,
          position: 'aboveBar',
          shape: 'square',
          color: s.move.color,
          text: t === peakT ? label : '',
          size: t === peakT ? 2 : 1,
        });
      }
      continue;
    }

    const c = candleAtTime(candles, peakT);
    if (!c) continue;
    out.push({
      time: c.time as UTCTimestamp,
      position: 'aboveBar',
      shape: 'square',
      color: s.move.color,
      text: label,
      size: 1,
    });
  }
  return out;
}
