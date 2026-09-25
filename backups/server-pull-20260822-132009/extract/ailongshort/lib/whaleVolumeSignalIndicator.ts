/**
 * 고래 거래량·캔들 → 짧은 지표식 신호 (LONG / SHORT / BIG SHORT / LONG BEAM …)
 */
import type { WhaleVolumeLiveMatch, WhaleVolumeMtfPack } from '@/lib/bitgetWhaleVolumeCatalog';
import type { SingleCandleCompare, RangeSegmentCompare } from '@/lib/bitgetWhaleVolumeCompare';

export type WhaleSignalDir = 'long' | 'short' | 'neutral';

export type WhaleSignalTag =
  | 'LONG'
  | 'SHORT'
  | 'WAIT'
  | 'BIG LONG'
  | 'BIG SHORT'
  | 'LONG BEAM'
  | 'SHORT BEAM'
  | 'TRAP↓'
  | 'TRAP↑';

export type WhaleVolumeSignalPack = {
  tag: WhaleSignalTag;
  /** 차트·HUD 대형 뱃지 */
  badge: string;
  /** 거래량 막대 위 초단문 */
  volLabel: string;
  /** 가격 캔들 위 초단문 */
  chartLabel: string;
  /** HUD 한 줄 */
  hudLine: string;
  /** 보조 한 줄 (+N봉 %) */
  subLine: string;
  dir: WhaleSignalDir;
  /** 1~5 강도 */
  strength: number;
  longPct: number;
  shortPct: number;
  forecastPct: number | null;
  forecastBars: number;
  tierBtc: number;
  color: string;
  glow: string;
  icon: string;
  /** 0~100 빔 게이지 (롱=+, 숏=-) */
  beamGauge: number;
  trap: boolean;
  beam: boolean;
  big: boolean;
};

const LONG = '#34d399';
const SHORT = '#fb7185';
const NEUT = '#fbbf24';
const TRAP = '#f472b6';
const BEAM_L = '#22d3ee';
const BEAM_S = '#f97316';

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function primaryForecast(
  single: SingleCandleCompare | null | undefined,
  match: WhaleVolumeLiveMatch,
  h: number
): { pct: number | null; longPct: number; shortPct: number } {
  const band = single?.forecasts.find((f) => f.bars === h) ?? single?.forecasts[0];
  return {
    pct: band?.medianPct ?? null,
    longPct: band?.longPct ?? match.longPct,
    shortPct: band?.shortPct ?? match.shortPct,
  };
}

function fmtPct(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`;
}

function isTrapRange(rg: RangeSegmentCompare | null | undefined): 'trapDown' | 'trapUp' | null {
  if (!rg) return null;
  const s = `${rg.scenarioKo} ${rg.theoryKo}`;
  if (/양봉위장|위장.*분산|분산.*위장/.test(s)) return 'trapDown';
  if (/음봉위장|위장.*매집|매집.*위장/.test(s)) return 'trapUp';
  if (rg.bullPct >= 55 && rg.sellPct >= 52 && rg.netPct <= 0.3) return 'trapDown';
  if (rg.bullPct <= 45 && rg.sellPct <= 48 && rg.netPct >= -0.3) return 'trapUp';
  return null;
}

function isBeam(single: SingleCandleCompare | null | undefined, match: WhaleVolumeLiveMatch): 'long' | 'short' | null {
  if (!single) return null;
  const rvol = single.rvol ?? match.currentRvol ?? 0;
  const burst = rvol >= 2.2 || /P99|극대|폭발|터짐/.test(single.burstKo);
  if (!burst) return null;
  if (single.isBull && single.buyBtc >= single.sellBtc * 0.92) return 'long';
  if (!single.isBull && single.sellBtc >= single.buyBtc * 0.92) return 'short';
  if (single.sellBtc > single.buyBtc * 1.08) return 'short';
  if (single.buyBtc > single.sellBtc * 1.08) return 'long';
  return null;
}

function mtfBoost(mtf: WhaleVolumeMtfPack | null | undefined, dir: WhaleSignalDir): number {
  if (!mtf?.rows?.length) return 0;
  let align = 0;
  let active = 0;
  for (const r of mtf.rows) {
    if (!r.match || r.match.sampleCount < 3) continue;
    active++;
    if (dir === 'long' && r.match.dominant === 'LONG') align++;
    if (dir === 'short' && r.match.dominant === 'SHORT') align++;
  }
  if (active < 2) return 0;
  return align >= active - 1 ? 1 : align >= 2 ? 0.5 : 0;
}

/** 단일·구간·MTF → 지표식 신호 팩 */
export function buildWhaleVolumeSignal(params: {
  match: WhaleVolumeLiveMatch | null;
  singleCandle?: SingleCandleCompare | null;
  rangeSegment?: RangeSegmentCompare | null;
  mtfPack?: WhaleVolumeMtfPack | null;
}): WhaleVolumeSignalPack | null {
  const { match, singleCandle, rangeSegment, mtfPack } = params;
  if (!match || match.sampleCount < 2) return null;

  const h = match.primaryHorizon;
  const fc = primaryForecast(singleCandle, match, h);
  const trap = isTrapRange(rangeSegment);
  const beam = isBeam(singleCandle, match);
  const big = match.tierBtc >= 5000;

  let dir: WhaleSignalDir =
    match.dominant === 'LONG' ? 'long' : match.dominant === 'SHORT' ? 'short' : 'neutral';
  if (fc.pct != null) {
    if (fc.pct > 0.15) dir = 'long';
    else if (fc.pct < -0.15) dir = 'short';
  }

  let tag: WhaleSignalTag = dir === 'long' ? 'LONG' : dir === 'short' ? 'SHORT' : 'WAIT';
  let strength = 2;

  if (trap === 'trapDown') {
    tag = 'TRAP↓';
    dir = 'short';
    strength = 4;
  } else if (trap === 'trapUp') {
    tag = 'TRAP↑';
    dir = 'long';
    strength = 4;
  } else if (beam === 'long') {
    tag = 'LONG BEAM';
    dir = 'long';
    strength = big ? 5 : 4;
  } else if (beam === 'short') {
    tag = 'SHORT BEAM';
    dir = 'short';
    strength = big ? 5 : 4;
  } else if (big && dir === 'long' && match.longPct >= 54) {
    tag = 'BIG LONG';
    strength = 4;
  } else if (big && dir === 'short' && match.shortPct >= 54) {
    tag = 'BIG SHORT';
    strength = 4;
  } else if (match.longPct >= 58 || match.shortPct >= 58) {
    strength = 3;
  }

  strength = clamp(strength + mtfBoost(mtfPack, dir), 1, 5);

  const icon =
    tag === 'TRAP↓' || tag === 'TRAP↑'
      ? '⚠'
      : dir === 'long'
        ? '▲'
        : dir === 'short'
          ? '▼'
          : '◆';

  const shortTag =
    tag === 'LONG BEAM'
      ? 'L-BEAM'
      : tag === 'SHORT BEAM'
        ? 'S-BEAM'
        : tag === 'BIG LONG'
          ? 'BIG-L'
          : tag === 'BIG SHORT'
            ? 'BIG-S'
            : tag === 'TRAP↓'
              ? 'TRAP↓'
              : tag === 'TRAP↑'
                ? 'TRAP↑'
                : tag;

  const pctTxt = fmtPct(fc.pct);
  const badge = `${icon} ${tag}`;
  const volLabel = `${icon} ${shortTag} ${pctTxt}`;
  const chartLabel = `${shortTag} ${pctTxt}`;
  const hudLine = `${tag} · +${h}봉 ${pctTxt}`;
  const subLine = `L${fc.longPct}% · S${fc.shortPct}% · ${match.tierBtc}BTC`;

  const color =
    tag.startsWith('TRAP')
      ? TRAP
      : tag.includes('BEAM')
        ? dir === 'long'
          ? BEAM_L
          : BEAM_S
        : dir === 'long'
          ? LONG
          : dir === 'short'
            ? SHORT
            : NEUT;

  const glow =
    dir === 'long'
      ? 'rgba(52,211,153,0.55)'
      : dir === 'short'
        ? 'rgba(251,113,133,0.55)'
        : 'rgba(251,191,36,0.45)';

  const beamGauge = clamp(
    Math.round((fc.longPct - fc.shortPct) * (strength / 3)),
    -100,
    100
  );

  return {
    tag,
    badge,
    volLabel,
    chartLabel,
    hudLine,
    subLine,
    dir,
    strength,
    longPct: fc.longPct,
    shortPct: fc.shortPct,
    forecastPct: fc.pct,
    forecastBars: h,
    tierBtc: match.tierBtc,
    color,
    glow,
    icon,
    beamGauge,
    trap: tag.startsWith('TRAP'),
    beam: tag.includes('BEAM'),
    big: tag.startsWith('BIG'),
  };
}

/** 거래량 막대 — 과거 고점용 짧은 라벨 */
export function whaleVolumePastBarLabel(
  side: 'long' | 'short',
  pct: number,
  rvolTag: string
): string {
  const arrow = side === 'long' ? '▲' : '▼';
  const st = side === 'long' ? 'L' : 'S';
  const shortRvol = rvolTag.replace(/RVOL/i, '').replace(/\s/g, '').slice(0, 8);
  return `${arrow}${st} ${shortRvol} ${fmtPct(pct)}`;
}
