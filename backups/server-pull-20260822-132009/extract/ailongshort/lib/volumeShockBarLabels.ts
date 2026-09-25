import type { UTCTimestamp } from 'lightweight-charts';
import type { Candle } from '@/types';
import { sanitizeChartCandlesForSeries } from '@/lib/volumeHistogramIntelligence';
import type { VolumePanelMarker } from '@/lib/volumeHistogramIntelligence';
import type { VolumeShockForecastResult } from '@/lib/volumeShockForecast';
import { buildVolumeShockChartGuide, volumeShockGuidePriceLevels } from '@/lib/volumeShockChartGuide';
import {
  evalBarVolumeShock,
  pickVolumeShockStatForSide,
  RVOL_SHOCK_MIN,
  type BarVolumeShock,
} from '@/lib/volumeShockMetrics';
import { horizonAt } from '@/lib/volumeShockFormat';
import {
  formatVolumeShockConfluenceTag,
  volumeShockConfluenceAt,
} from '@/lib/volumeShockConfluence';
import {
  detectVolumeRangePhases,
  getVolumeRangePhaseAt,
  phaseMarkerScore,
  type VolumeRangePhase,
} from '@/lib/volumeRangeAccumDist';
import type { VolumePhaseCurrentMatch } from '@/lib/volumePhaseStats';
import { formatVolumePhaseCurrentLabel } from '@/lib/volumePhaseChartLabel';
import type { WhaleVolumeLiveMatch } from '@/lib/bitgetWhaleVolumeCatalog';
import { whaleVolumeMarkerLabel } from '@/lib/bitgetWhaleVolumeCatalog';
import type { WhaleVolumeSignalPack } from '@/lib/whaleVolumeSignalIndicator';
import { whaleVolumePastBarLabel } from '@/lib/whaleVolumeSignalIndicator';
import { analyzeCandleVolumeJoint, scoreGreenTrapSegment } from '@/lib/volumeCandleJoint';

function fmtUsd(n: number): string {
  if (!Number.isFinite(n)) return '—';
  const sign = n > 0 ? '+' : n < 0 ? '' : '';
  const v = Math.abs(Math.round(n));
  if (v >= 1000) return `${sign}$${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k`;
  return `${sign}$${v}`;
}

function fmtPct(n: number): string {
  if (!Number.isFinite(n)) return '—';
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toFixed(1)}%`;
}

function forwardUsd(candles: Candle[], idx: number, bars: number): { usd: number; pct: number } | null {
  const c0 = candles[idx];
  const c1 = candles[idx + bars];
  if (!c0 || !c1 || c0.close <= 0) return null;
  return { usd: c1.close - c0.close, pct: ((c1.close / c0.close) - 1) * 100 };
}

/** RVOL2.4×·P99·5.0k → 2.4×P99 */
function shortenShockTag(tag: string): string {
  const parts = tag
    .split('·')
    .map((p) => p.replace(/^RVOL/i, '').trim())
    .filter(Boolean);
  const out: string[] = [];
  for (const p of parts) {
    if (p.includes('×')) out.push(p.replace(/\s/g, ''));
    else if (/^P\d+/i.test(p)) out.push(p);
    else if (/k$/i.test(p) && !out.some((x) => /^P/i.test(x))) out.push(p);
    if (out.length >= 2) break;
  }
  return out.join('') || tag.slice(0, 10);
}

function shockScore(shock: BarVolumeShock): number {
  let s = shock.rvol;
  if (shock.tags.includes('P99')) s += 2.5;
  else if (shock.tags.includes('P95')) s += 1;
  if (shock.rvol >= RVOL_SHOCK_MIN * 1.5) s += 0.5;
  return s;
}

/** 과거 봉: P99 또는 RVOL≥2.5만 라벨 (막대 색은 별도) */
function qualifiesPastLabel(shock: BarVolumeShock): boolean {
  return shock.tags.includes('P99') || shock.rvol >= RVOL_SHOCK_MIN * 1.25;
}

function thinShockMarkers(
  markers: VolumePanelMarker[],
  candles: Candle[],
  minBarGap: number
): VolumePanelMarker[] {
  if (minBarGap <= 0 || markers.length <= 1) return markers;
  const safe = sanitizeChartCandlesForSeries(candles);
  const idxOf = new Map<number, number>();
  safe.forEach((c, i) => idxOf.set(Number(c.time), i));

  const sorted = [...markers].sort(
    (a, b) => (idxOf.get(Number(a.time)) ?? 0) - (idxOf.get(Number(b.time)) ?? 0)
  );
  const out: VolumePanelMarker[] = [];
  let lastIdx = -1_000_000;
  for (const m of sorted) {
    const idx = idxOf.get(Number(m.time));
    if (idx === undefined) continue;
    if (out.length === 0 || idx - lastIdx >= minBarGap) {
      out.push(m);
      lastIdx = idx;
    }
  }
  return out;
}

type ShockCandidate = { idx: number; shock: BarVolumeShock; score: number; isLast: boolean };

function buildRangePhaseMarkers(
  rows: Candle[],
  phases: VolumeRangePhase[],
  lastIdx: number,
  focusBars: number,
  maxPhaseMarks = 10
): VolumePanelMarker[] {
  const distCol = 'rgba(251,146,60,0.96)';
  const accCol = 'rgba(45,212,191,0.92)';
  const warnCol = 'rgba(244,114,182,0.95)';
  const trapCol = 'rgba(250,204,21,0.95)';
  const out: VolumePanelMarker[] = [];

  const candidates: { idx: number; phase: VolumeRangePhase; atEnd: boolean; score: number }[] = [];
  for (const p of phases) {
    if (p.phase === 'neutral') continue;
    const seg = rows.slice(p.fromIdx, p.toIdx + 1);
    const trap = scoreGreenTrapSegment(seg);
    const atEnd = p.toIdx;
    candidates.push({ idx: atEnd, phase: p, atEnd: true, score: phaseMarkerScore(p, true) });
    if (p.phase === 'distribution' && trap.isTrap) {
      const mid = Math.floor((p.fromIdx + p.toIdx) / 2);
      candidates.push({
        idx: mid,
        phase: p,
        atEnd: false,
        score: phaseMarkerScore(p, false) + trap.score + 3,
      });
    }
    if (atEnd === lastIdx || getVolumeRangePhaseAt(phases, lastIdx)?.toIdx === p.toIdx) {
      candidates.push({ idx: lastIdx, phase: p, atEnd: false, score: phaseMarkerScore(p, false) + 4 });
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  const pickedIdx = new Set<number>();

  for (const c of candidates) {
    if (out.length >= maxPhaseMarks) break;
    if (pickedIdx.has(c.idx)) continue;
    const p = c.phase;
    const pct = Math.round((p.phase === 'distribution' ? p.sellPct : p.buyPct) * 100);
    const joint = analyzeCandleVolumeJoint(rows, p.fromIdx, p.toIdx, p.phase);
    const trap = scoreGreenTrapSegment(rows.slice(p.fromIdx, p.toIdx + 1));
    const head = joint
      ? joint.scenarioKo
      : trap.isTrap
        ? `양봉위장·분산 ${p.bars}봉`
        : p.phase === 'distribution'
          ? `횡보·매도분산 ${p.bars}봉`
          : `횡보·매집 ${p.bars}봉`;
    let tail = '';
    if (p.breakUsd != null && Number.isFinite(p.breakUsd) && c.atEnd) {
      const arrow = p.breakUsd >= 0 ? '▲' : '▼';
      tail = ` →${arrow}${fmtUsd(p.breakUsd)} ${fmtPct(p.breakPct ?? 0)}`;
    } else if (c.idx === lastIdx && p.phase === 'distribution') {
      tail = ' · 이탈주의';
    } else {
      const fwd = c.idx + focusBars < rows.length ? forwardUsd(rows, c.idx, focusBars) : null;
      if (fwd) {
        tail = ` +${focusBars}${fwd.usd >= 0 ? '▲' : '▼'}${fmtUsd(fwd.usd)}`;
      }
    }
    const text = `${head}${tail}`;

    out.push({
      time: rows[c.idx].time as UTCTimestamp,
      position: 'aboveBar',
      shape: 'square',
      color:
        trap.isTrap && !c.atEnd
          ? trapCol
          : p.phase === 'distribution'
            ? c.idx === lastIdx
              ? warnCol
              : distCol
            : accCol,
      text,
      size: c.idx === lastIdx ? 2 : 1,
    });
    pickedIdx.add(c.idx);
  }
  return out;
}

/**
 * RVOL·P99 + 횡보 매집/매도분산 — 짧은 라벨, 간격·개수 제한
 */
export function buildVolumeShockVolumeMarkers(
  candles: Candle[],
  vs: VolumeShockForecastResult | null,
  maxMarks = 10,
  minBarGap = 4,
  phaseCurrent: VolumePhaseCurrentMatch | null = null,
  whaleMatch: WhaleVolumeLiveMatch | null = null,
  whaleSignal: WhaleVolumeSignalPack | null = null
): VolumePanelMarker[] {
  if (!vs) return [];
  const rows = sanitizeChartCandlesForSeries(candles);
  const n = rows.length;
  if (n < RVOL_SHOCK_MIN + 8) return [];

  const focusBars = 4;
  const lastIdx = n - 1;
  const lookback = 55;
  const candidates: ShockCandidate[] = [];

  for (let i = n - 1; i >= Math.max(0, n - lookback); i--) {
    const shock = evalBarVolumeShock(rows, i, vs);
    if (!shock) continue;
    const isLast = i === lastIdx;
    if (!isLast && !qualifiesPastLabel(shock)) continue;
    candidates.push({ idx: i, shock, score: shockScore(shock) + (isLast ? 100 : 0), isLast });
  }

  candidates.sort((a, b) => b.score - a.score);
  const picked = new Set<number>();
  const chosen: ShockCandidate[] = [];
  for (const c of candidates) {
    if (chosen.length >= maxMarks) break;
    if (picked.has(c.idx)) continue;
    let tooClose = false;
    for (const p of picked) {
      if (Math.abs(p - c.idx) < minBarGap && !c.isLast) {
        tooClose = true;
        break;
      }
    }
    if (tooClose) continue;
    chosen.push(c);
    picked.add(c.idx);
  }

  if (!chosen.some((c) => c.isLast)) {
    const lastShock = evalBarVolumeShock(rows, lastIdx, vs);
    if (lastShock) {
      chosen.unshift({ idx: lastIdx, shock: lastShock, score: 999, isLast: true });
      picked.add(lastIdx);
    }
  }

  const longCol = 'rgba(52,211,153,0.95)';
  const shortCol = 'rgba(251,113,133,0.95)';
  const nowCol = 'rgba(34,211,238,0.98)';
  const pastCol = 'rgba(148,163,184,0.82)';

  const markers: VolumePanelMarker[] = [];

  for (const { idx, shock, isLast } of chosen) {
    const c = rows[idx];
    const t = c.time as UTCTimestamp;
    const tag = shortenShockTag(shock.primaryTag);
    const sideCh = shock.side === 'long' ? '매' : '도';
    const fwd = idx + focusBars < n ? forwardUsd(rows, idx, focusBars) : null;

    let text: string;
    let color: string;

    if (isLast) {
      const stat = pickVolumeShockStatForSide(shock.side, vs);
      const h4 = horizonAt(stat, 4);
      const prob = h4 ? Math.round(h4.probFavorable * 100) : 0;
      const med = h4?.medianMoveUsd ?? (h4 ? (h4.medianPct / 100) * c.close : 0);
      if (whaleSignal && whaleMatch && whaleMatch.sampleCount >= 3) {
        text = whaleSignal.volLabel;
        color =
          whaleSignal.dir === 'long'
            ? nowCol
            : whaleSignal.dir === 'short'
              ? shortCol
              : 'rgba(250,204,21,0.98)';
      } else {
        const ref =
          shock.side === 'short'
            ? `−${fmtUsd(Math.abs(med)).replace('+', '')}`
            : fmtUsd(med);
        const conf = volumeShockConfluenceAt(rows, idx);
        const confTxt = conf ? formatVolumeShockConfluenceTag(shock.side, conf) : '';
        const nTxt = stat?.sampleCount ? `n${stat.sampleCount}` : '';
        text = `${tag} ${sideCh} · +${focusBars} ${ref} ${prob}%`;
        if (nTxt) text += ` ${nTxt}`;
        if (confTxt) text += ` · ${confTxt}`;
        color = shock.side === 'long' ? nowCol : shortCol;
      }
    } else if (fwd) {
      const side = fwd.pct >= 0 ? 'long' : 'short';
      text = whaleMatch
        ? whaleVolumePastBarLabel(side, fwd.pct, tag)
        : `${tag} +${focusBars}${fwd.usd >= 0 ? '▲' : '▼'}${fmtUsd(fwd.usd)} ${fmtPct(fwd.pct)}`;
      color =
        shock.side === 'long'
          ? fwd.usd >= 0
            ? pastCol
            : 'rgba(251,191,36,0.75)'
          : fwd.usd <= 0
            ? pastCol
            : 'rgba(251,191,36,0.75)';
    } else {
      continue;
    }

    markers.push({
      time: t,
      position: 'aboveBar',
      shape: 'square',
      color,
      text,
      size: isLast ? 2 : 1,
    });
  }

  const tf = vs.timeframe || '15m';
  const phases = detectVolumeRangePhases(rows, tf, 140, 6);
  const phaseMk = buildRangePhaseMarkers(rows, phases, lastIdx, focusBars, 10);
  let combined = [...phaseMk, ...markers];

  if (phaseCurrent && rows.length > 0) {
    const last = rows[lastIdx];
    const phaseLabel = formatVolumePhaseCurrentLabel(phaseCurrent);
    const phaseMarker: VolumePanelMarker = {
      time: last.time as UTCTimestamp,
      position: 'aboveBar',
      shape: 'square',
      color: phaseCurrent.eventType === 'RANGE_DIST' ? 'rgba(251,146,60,0.98)' : 'rgba(45,212,191,0.98)',
      text: phaseLabel,
      size: 2,
    };
    combined = combined.filter((m) => Number(m.time) !== Number(last.time));
    combined.push(phaseMarker);
  } else if (whaleSignal && whaleMatch && whaleMatch.sampleCount >= 3 && rows.length > 0) {
    const last = rows[lastIdx];
    const whaleMarker: VolumePanelMarker = {
      time: last.time as UTCTimestamp,
      position: 'aboveBar',
      shape: 'square',
      color: whaleSignal.color,
      text: whaleSignal.volLabel,
      size: 2,
    };
    combined = combined.filter((m) => Number(m.time) !== Number(last.time));
    combined.push(whaleMarker);
  } else if (whaleMatch && whaleMatch.sampleCount >= 3 && rows.length > 0) {
    const last = rows[lastIdx];
    const whaleLabel = whaleVolumeMarkerLabel(whaleMatch);
    const whaleMarker: VolumePanelMarker = {
      time: last.time as UTCTimestamp,
      position: 'aboveBar',
      shape: 'square',
      color:
        whaleMatch.dominant === 'LONG'
          ? 'rgba(52,211,153,0.98)'
          : whaleMatch.dominant === 'SHORT'
            ? 'rgba(251,113,133,0.98)'
            : 'rgba(250,204,21,0.98)',
      text: whaleLabel,
      size: 2,
    };
    combined = combined.filter((m) => Number(m.time) !== Number(last.time));
    combined.push(whaleMarker);
  }

  return thinShockMarkers(
    combined.sort((a, b) => Number(a.time) - Number(b.time)),
    rows,
    Math.max(3, minBarGap - 1)
  );
}

export function volumeShockPriceLineTitles(guide: NonNullable<ReturnType<typeof buildVolumeShockChartGuide>>) {
  const levels = volumeShockGuidePriceLevels(guide, 4);
  const h = guide.horizons.find((x) => x.bars === 4) ?? guide.horizons[0];
  const prob = h?.probFavorablePct ?? 0;
  const side = guide.side === 'short' ? '↓' : '↑';
  return levels.map((lv) => {
    if (Math.abs(lv.price - guide.close) < 1) return { ...lv, title: `현재` };
    if (lv.kind === 'median') return { ...lv, title: `+4${side} ${lv.title} ${prob}%` };
    return { ...lv, title: lv.title };
  });
}
