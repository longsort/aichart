/**
 * 통합·분석 공유 신호 — 타점엔진 공동 사용.
 * 선진거래량 · 1일봉면(상승/하락). 확정 수익 아님.
 */
import type { Candle } from '@/types';
import { buildMergedDeskAdvVolumePack } from '@/lib/mergedDeskAdvVolumeRead';

export type TapAdvVolumeHint = {
  kind: string;
  action: 'long-ref' | 'short-ref' | 'wait' | 'watch';
  actionKo: string;
  tagKo: string;
  buyPct: number;
  rvol: number | null;
  notable: boolean;
  time: number;
};

export type TapDailyFaceHint = {
  bias: 'up' | 'down' | 'flat';
  labelKo: string;
  noteKo: string;
};

export type TapSharedMergedSignals = {
  advVolume: TapAdvVolumeHint | null;
  dailyFace: TapDailyFaceHint | null;
};

function toCandles(
  rows: Array<{
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume?: number;
  }>
): Candle[] {
  return (rows || [])
    .map((c) => ({
      time: Number(c.time),
      open: Number(c.open),
      high: Number(c.high),
      low: Number(c.low),
      close: Number(c.close),
      volume: Number(c.volume) || 0,
    }))
    .filter((c) => c.time > 0 && c.close > 0);
}

/** 통합모드와 동일 선진거래량 팩 → 타점용 요약 */
export function readTapAdvVolumeHint(
  candles: Array<{
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume?: number;
  }>,
  timeframe: string
): TapAdvVolumeHint | null {
  const rows = toCandles(candles);
  if (rows.length < 16) return null;
  try {
    const pack = buildMergedDeskAdvVolumePack(rows, {
      timeframe,
      swingAnchorOn: true,
      spotPx: rows[rows.length - 1]?.close ?? null,
    });
    const last = pack.last;
    if (!last) return null;
    return {
      kind: String(last.kind),
      action: last.action,
      actionKo: last.actionKo,
      tagKo: last.tagKo,
      buyPct: last.buyPct,
      rvol: last.rvol,
      notable: last.notable,
      time: last.time,
    };
  } catch {
    return null;
  }
}

/**
 * 1일봉면 — EMA20·최근 종가 구조로 상승/하락면 근사.
 * 통합 AIZONE 일봉면과 같은 용도(방향 정렬).
 */
export function readTapDailyFaceHint(
  dailyCandles: Array<{
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume?: number;
  }>
): TapDailyFaceHint | null {
  const rows = toCandles(dailyCandles);
  if (rows.length < 25) return null;
  const closes = rows.map((r) => r.close);
  const period = 20;
  let sum = 0;
  for (let i = closes.length - period; i < closes.length; i++) sum += closes[i]!;
  const emaApprox = sum / period;
  const last = closes[closes.length - 1]!;
  const prev = closes[closes.length - 2]!;
  const slope =
    closes[closes.length - 1]! - closes[closes.length - 6]!;
  const above = last >= emaApprox * 0.998;
  const rising = slope > 0 && last >= prev;
  const below = last <= emaApprox * 1.002;
  const falling = slope < 0 && last <= prev;

  if (above && rising) {
    return {
      bias: 'up',
      labelKo: '일봉면 상승',
      noteKo: `종가 ${last.toFixed(0)} ≥ EMA20 ${emaApprox.toFixed(0)} · 상승면`,
    };
  }
  if (below && falling) {
    return {
      bias: 'down',
      labelKo: '일봉면 하락',
      noteKo: `종가 ${last.toFixed(0)} ≤ EMA20 ${emaApprox.toFixed(0)} · 하락면`,
    };
  }
  return {
    bias: 'flat',
    labelKo: '일봉면 혼조',
    noteKo: `종가 ${last.toFixed(0)} · EMA20 ${emaApprox.toFixed(0)} · 혼조`,
  };
}

export function buildTapSharedMergedSignals(params: {
  candles: Array<{
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume?: number;
  }>;
  timeframe: string;
  dailyCandles?: Array<{
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume?: number;
  }> | null;
}): TapSharedMergedSignals {
  return {
    advVolume: readTapAdvVolumeHint(params.candles, params.timeframe),
    dailyFace: params.dailyCandles?.length
      ? readTapDailyFaceHint(params.dailyCandles)
      : null,
  };
}

/** 선진거래량 → 흐름점수 보정 */
export function advVolumeFlowAdjust(
  base: number,
  hint: TapAdvVolumeHint | null,
  direction: 'LONG' | 'SHORT' | null
): number {
  if (!hint) return base;
  let s = base;
  if (hint.action === 'long-ref' || hint.kind.includes('buy') || hint.kind === 'big-long') {
    s = Math.max(s, hint.notable ? 78 : 68);
    if (direction === 'SHORT') s = Math.min(s, 42);
  }
  if (hint.action === 'short-ref' || hint.kind.includes('sell') || hint.kind === 'big-short') {
    s = Math.max(s, hint.notable ? 78 : 68);
    if (direction === 'LONG') s = Math.min(s, 42);
  }
  if (hint.rvol != null && hint.rvol >= 1.5) s = Math.min(100, s + 6);
  return Math.max(0, Math.min(100, Math.round(s)));
}

/** 일봉면 역행이면 게이트 실패 태그 */
export function dailyFaceGateTag(
  face: TapDailyFaceHint | null,
  direction: 'LONG' | 'SHORT' | null
): { ok: boolean; soft: boolean; tag: string } {
  if (!face || face.bias === 'flat' || !direction) {
    return { ok: true, soft: true, tag: face?.labelKo || '일봉면없음' };
  }
  if (direction === 'LONG' && face.bias === 'up') {
    return { ok: true, soft: false, tag: `${face.labelKo}·롱정렬` };
  }
  if (direction === 'SHORT' && face.bias === 'down') {
    return { ok: true, soft: false, tag: `${face.labelKo}·숏정렬` };
  }
  if (direction === 'LONG' && face.bias === 'down') {
    return { ok: false, soft: false, tag: `${face.labelKo}·롱역행` };
  }
  if (direction === 'SHORT' && face.bias === 'up') {
    return { ok: false, soft: false, tag: `${face.labelKo}·숏역행` };
  }
  return { ok: true, soft: true, tag: face.labelKo };
}
