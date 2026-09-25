/**
 * 구간·거래량 후행 % → 한글 등급 (약/중/강 반등·하락) + 진입·목표
 * zone/SMC 기능과 무관 — Bitget 거래량 구간 통계 전용
 */
import type { ForwardPctBand } from '@/lib/bitgetWhaleVolumeCompare';

export type MoveTierKo =
  | '약반등'
  | '중반등'
  | '강반등'
  | '약하락'
  | '중하락'
  | '강하락'
  | '횡보';

export type MoveDir = 'long' | 'short' | 'neutral';

export type WhaleMoveTierPack = {
  tier: MoveTierKo;
  dir: MoveDir;
  tierLabel: string;
  pctLabel: string;
  rangeLabel: string;
  entryKo: string;
  targetKo: string;
  chartLine1: string;
  chartLine2: string;
  volLine: string;
  color: string;
  longPct: number;
  shortPct: number;
};

const LONG_C = '#34d399';
const SHORT_C = '#fb7185';
const NEUT_C = '#fbbf24';

function fmtPct(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`;
}

function fmtRange(p25: number | null, p75: number | null): string {
  if (p25 == null || p75 == null || !Number.isFinite(p25) || !Number.isFinite(p75)) return '';
  return `${fmtPct(p25)}~${fmtPct(p75)}`;
}

export function classifyMoveTier(pct: number | null): { tier: MoveTierKo; dir: MoveDir } {
  if (pct == null || !Number.isFinite(pct)) return { tier: '횡보', dir: 'neutral' };
  if (pct > 0.12) {
    if (pct < 0.85) return { tier: '약반등', dir: 'long' };
    if (pct < 2.0) return { tier: '중반등', dir: 'long' };
    return { tier: '강반등', dir: 'long' };
  }
  if (pct < -0.12) {
    if (pct > -0.85) return { tier: '약하락', dir: 'short' };
    if (pct > -2.0) return { tier: '중하락', dir: 'short' };
    return { tier: '강하락', dir: 'short' };
  }
  return { tier: '횡보', dir: 'neutral' };
}

function entryKoFor(params: {
  dir: MoveDir;
  phase?: 'accumulation' | 'distribution';
  trap?: boolean;
}): string {
  const { dir, phase, trap } = params;
  if (trap) return '숏·양봉위장·고점';
  if (dir === 'long' || phase === 'accumulation') return '롱·구간저점';
  if (dir === 'short' || phase === 'distribution') return '숏·구간고점';
  return '관망·구간중심';
}

function colorFor(dir: MoveDir, trap?: boolean): string {
  if (trap) return '#f472b6';
  if (dir === 'long') return LONG_C;
  if (dir === 'short') return SHORT_C;
  return NEUT_C;
}

export function buildWhaleMoveTierPack(params: {
  medianPct: number | null;
  p25Pct?: number | null;
  p75Pct?: number | null;
  forecastBars: number;
  longPct?: number;
  shortPct?: number;
  phase?: 'accumulation' | 'distribution';
  trap?: boolean;
  scenarioKo?: string;
}): WhaleMoveTierPack {
  const {
    medianPct,
    p25Pct = null,
    p75Pct = null,
    forecastBars,
    longPct = 50,
    shortPct = 50,
    phase,
    trap = false,
    scenarioKo,
  } = params;

  const { tier } = classifyMoveTier(medianPct);
  const entry = entryKoFor({
    dir: classifyMoveTier(medianPct).dir,
    phase,
    trap,
  });
  const range = fmtRange(p25Pct, p75Pct);
  const pct = fmtPct(medianPct);
  const target =
    medianPct != null && Number.isFinite(medianPct)
      ? `목표 ${pct}`
      : range
        ? `구간 ${range}`
        : '목표 —';

  const scenario = scenarioKo
    ? scenarioKo.slice(0, 10)
    : phase === 'accumulation'
      ? '매집'
      : phase === 'distribution'
        ? '분산'
        : '';

  const chartLine1 = scenario ? `${scenario} · +${forecastBars}봉 ${tier} ${pct}` : `+${forecastBars}봉 ${tier} ${pct}`;
  const chartLine2 = `${entry} · ${target}${range ? ` (${range})` : ''}`;
  const volLine = range ? `${tier} ${range}` : `${tier} ${pct}`;

  return {
    tier,
    dir: classifyMoveTier(medianPct).dir,
    tierLabel: tier,
    pctLabel: pct,
    rangeLabel: range,
    entryKo: entry,
    targetKo: target,
    chartLine1,
    chartLine2,
    volLine,
    color: colorFor(classifyMoveTier(medianPct).dir, trap),
    longPct,
    shortPct,
  };
}

export function moveTierFromForwardBand(
  band: ForwardPctBand | null | undefined,
  ctx?: {
    phase?: 'accumulation' | 'distribution';
    trap?: boolean;
    scenarioKo?: string;
  }
): WhaleMoveTierPack {
  return buildWhaleMoveTierPack({
    medianPct: band?.medianPct ?? null,
    p25Pct: band?.p25Pct ?? null,
    p75Pct: band?.p75Pct ?? null,
    forecastBars: band?.bars ?? 4,
    longPct: band?.longPct ?? 50,
    shortPct: band?.shortPct ?? 50,
    phase: ctx?.phase,
    trap: ctx?.trap,
    scenarioKo: ctx?.scenarioKo,
  });
}
