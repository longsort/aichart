/**
 * §5 MACRO MAP — TF별 DIRECTION / LOCATION / STRUCTURE / MOMENTUM / FLOW / RISK.
 * 기존 detectStructureCausal + premiumDiscount 재사용.
 */
import { detectStructureCausal, type Eagle1Bar, type StructureSnapshot } from '@/lib/eagle1/structureEngine';
import { runPremiumDiscount } from '@/lib/eagle1/premiumDiscountEngine';
import { rsi } from '@/lib/indicators';
import type { Candle } from '@/types';
import type { TapMacroFrame } from './types';
import { mapEagleRegimeKo } from './regimeMap';
import { sliceClosedBarsForHtf, type TapHtfCloseStatus } from './sessionCloseKst';

export type TapMacroBar = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
};

function toBars(c: TapMacroBar[]): Eagle1Bar[] {
  return c.map((x) => ({
    time: Number(x.time),
    open: Number(x.open),
    high: Number(x.high),
    low: Number(x.low),
    close: Number(x.close),
    volume: Number(x.volume) || 0,
  }));
}

function lastEventBias(s: StructureSnapshot | null): TapMacroFrame['direction'] {
  if (!s?.events?.length) return 'NEUTRAL';
  const ev =
    [...s.events].reverse().find((e) => e.kind !== 'SWING') || s.events[s.events.length - 1];
  if (ev?.bias === 'bullish') return 'LONG';
  if (ev?.bias === 'bearish') return 'SHORT';
  return 'NEUTRAL';
}

function locFromPd(zone: string | undefined): TapMacroFrame['location'] {
  if (zone === 'PREMIUM') return 'PREMIUM';
  if (zone === 'DISCOUNT') return 'DISCOUNT';
  if (zone === 'EQUILIBRIUM') return 'EQUILIBRIUM';
  return 'UNKNOWN';
}

function lastRsi(bars: TapMacroBar[]): number | null {
  if (bars.length < 20) return null;
  try {
    const series = rsi(bars as Candle[], 14);
    const v = series[series.length - 1];
    return Number.isFinite(v) ? Number(v) : null;
  } catch {
    return null;
  }
}

function volumeSlopeKo(bars: TapMacroBar[]): string {
  if (bars.length < 10) return '거래량—';
  const a = bars.slice(-10, -5);
  const b = bars.slice(-5);
  const avg = (xs: TapMacroBar[]) =>
    xs.reduce((s, x) => s + (Number(x.volume) || 0), 0) / Math.max(1, xs.length);
  const va = avg(a);
  const vb = avg(b);
  if (!(va > 0)) return '거래량—';
  const r = vb / va;
  if (r >= 1.35) return '거래량↑';
  if (r <= 0.75) return '거래량↓';
  return '거래량평';
}

export function buildOneMacroFrame(params: {
  tf: string;
  candles: TapMacroBar[] | null | undefined;
  /** 파이프라인에서 이미 계산된 구조(진입 TF) */
  structureOverride?: StructureSnapshot | null;
  flowHintKo?: string | null;
}): { frame: TapMacroFrame | null; structure: StructureSnapshot | null; close: TapHtfCloseStatus | null } {
  const raw = params.candles || [];
  if (raw.length < 24 && !params.structureOverride) {
    return { frame: null, structure: null, close: null };
  }

  const sliced = sliceClosedBarsForHtf(raw, params.tf);
  const bars = sliced.bars;
  let structure = params.structureOverride || null;
  if (!structure && bars.length >= 24) {
    try {
      structure = detectStructureCausal(toBars(bars));
    } catch {
      structure = null;
    }
  }
  if (!structure) {
    return { frame: null, structure: null, close: sliced.close };
  }

  const px = Number(bars[bars.length - 1]?.close) || 0;
  const pd = runPremiumDiscount({ lastClose: px, structure });
  const dir = lastEventBias(structure);
  const rsiV = lastRsi(bars);
  const volKo = volumeSlopeKo(bars);
  const developTag = sliced.droppedDeveloping ? ' · LIVE미확정봉제외' : '';
  const closeTag =
    sliced.close.useClosedOnly && sliced.close.developing
      ? ` · ${sliced.close.statusKo}`
      : '';

  const noteParts = [
    mapEagleRegimeKo(structure.regime),
    pd.zone !== 'NONE' ? pd.zone : null,
    rsiV != null ? `RSI${Math.round(rsiV)}` : null,
    volKo,
    dir === 'LONG' && pd.zone === 'PREMIUM'
      ? '상승구조·프리미엄·추격금지'
      : dir === 'SHORT' && pd.zone === 'DISCOUNT'
        ? '하락구조·디스카운트·추격금지'
        : null,
  ].filter(Boolean);

  const frame: TapMacroFrame = {
    tf: params.tf,
    direction: dir,
    location: locFromPd(pd.zone),
    structure: String(structure.state || 'IDLE'),
    momentum: mapEagleRegimeKo(structure.regime),
    flow: params.flowHintKo || volKo,
    risk:
      (rsiV != null && rsiV >= 72 && dir === 'LONG') || (rsiV != null && rsiV <= 28 && dir === 'SHORT')
        ? '과열·추격주의'
        : sliced.droppedDeveloping
          ? '미확정봉제외'
          : '—',
    noteKo: `${noteParts.join(' · ')}${developTag}${closeTag}`,
  };

  return { frame, structure, close: sliced.close };
}

export const TAP_MACRO_TF_ORDER = ['1M', '1W', '1D', '4H', '1H'] as const;

export type TapMacroCandlePack = {
  '1M'?: TapMacroBar[] | null;
  '1W'?: TapMacroBar[] | null;
  '1D'?: TapMacroBar[] | null;
  '4H'?: TapMacroBar[] | null;
  '1H'?: TapMacroBar[] | null;
};

export function buildTapMacroFrames(params: {
  pack: TapMacroCandlePack;
  entryStructure?: StructureSnapshot | null;
  entryTf?: string;
  entryCandles?: TapMacroBar[] | null;
  flowHintKo?: string | null;
}): {
  frames: TapMacroFrame[];
  structures: Partial<Record<string, StructureSnapshot>>;
  htfBias: 'bullish' | 'bearish' | null;
} {
  const structures: Partial<Record<string, StructureSnapshot>> = {};
  const frames: TapMacroFrame[] = [];

  for (const tf of TAP_MACRO_TF_ORDER) {
    const key = tf as keyof TapMacroCandlePack;
    const candles = params.pack[key];
    const { frame, structure } = buildOneMacroFrame({
      tf,
      candles,
      flowHintKo: params.flowHintKo,
    });
    if (structure) structures[tf] = structure;
    if (frame) frames.push(frame);
  }

  /** 진입 TF는 MACRO 뒤에 보조로 붙이지 않음 — Context만. 부족하면 진입구조로 1행 보강 */
  if (!frames.length && params.entryStructure) {
    const { frame } = buildOneMacroFrame({
      tf: params.entryTf || 'ENTRY',
      candles: params.entryCandles || [],
      structureOverride: params.entryStructure,
      flowHintKo: params.flowHintKo,
    });
    if (frame) frames.push(frame);
  }

  const htf =
    structures['1D'] || structures['4H'] || structures['1W'] || structures['1H'] || null;
  let htfBias: 'bullish' | 'bearish' | null = null;
  if (htf) {
    const d = lastEventBias(htf);
    htfBias = d === 'LONG' ? 'bullish' : d === 'SHORT' ? 'bearish' : null;
  }

  return { frames, structures, htfBias };
}
