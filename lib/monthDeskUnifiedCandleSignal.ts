/**
 * 마감·안착: 마지막 봉 부근 캔들 마커 연합 — 로켓·기관밴드 터치는 유지, 나머지는 ◈L/◈S 하나로 합산.
 */
import type { AnalyzeResponse, Candle } from '@/types';
import type { ClosingEnvelopeFuturesScenario } from '@/lib/institutionalSuperBand';
import type { MonthDeskConfirmedInput } from '@/lib/monthDeskZoneSignalPalette';
import { buildUnifiedLsSignal } from '@/lib/unifiedSignalEngine';
import {
  buildProfileFromPanelFeatures,
  DEFAULT_UNIFIED_PANEL_FEATURES,
} from '@/lib/unifiedSignalPanelProfile';

export type MonthDeskCandleVoteDir = 'LONG' | 'SHORT' | 'NEUTRAL';

export type MonthDeskCandleVote = {
  direction: MonthDeskCandleVoteDir;
  weight: number;
  source: string;
};

export type MonthDeskFusedCandleSignal = {
  direction: 'LONG' | 'SHORT' | 'WAIT';
  longScore: number;
  shortScore: number;
  confidencePct: number;
  label: string;
  tierKo: string;
  sourcesKo: string[];
};

export type MonthDeskStructurePickLike = {
  barTime: number;
  highlight: { bias: 'bullish' | 'bearish'; phase: string };
  pickedOnLastBar?: boolean;
} | null;

export type ChartMarkerLike = {
  time: number | { timestamp?: number };
  position?: string;
  shape?: string;
  color?: string;
  text?: string;
  size?: number;
  id?: string;
};

const ROCKET_RE = /^🚀|^📉|🚀|📉/;

/** ChartView `formatInstitutionalBandTouchMarkerChartText` 와 동일 — LP/SP·LH/SH·⚡L★ 등 */
export function isMonthDeskBandMarker(m: { text?: string; shape?: string }): boolean {
  const tx = String(m.text ?? '').trim();
  if (/^[⚡]?[LS][HP]?[★◆·]/.test(tx)) return true;
  if (
    (m.shape === 'arrowUp' || m.shape === 'arrowDown') &&
    /^[⚡]?[LS]/.test(tx)
  ) {
    return true;
  }
  if (tx === 'LP' || tx === 'SP' || tx === 'LH' || tx === 'SH') return true;
  return false;
}

export function isMonthDeskRocketMarker(m: { text?: string }): boolean {
  const tx = String(m.text ?? '').trim();
  if (isMonthDeskBandMarker(m)) return false;
  return ROCKET_RE.test(tx) || tx.includes('🚀⚡') || tx.includes('📉⚡');
}

export function monthDeskFuseBarTimes(candles: Candle[], fuseBarCount = 2): Set<number> {
  const out = new Set<number>();
  if (!candles.length) return out;
  const n = Math.max(1, Math.min(fuseBarCount, candles.length));
  for (let i = candles.length - n; i < candles.length; i++) {
    const t = Number(candles[i]!.time);
    if (Number.isFinite(t)) out.add(t);
  }
  return out;
}

function addVote(map: Map<number, MonthDeskCandleVote[]>, t: number, vote: MonthDeskCandleVote) {
  if (!Number.isFinite(t)) return;
  const list = map.get(t) ?? [];
  list.push(vote);
  map.set(t, list);
}

export function fuseMonthDeskCandleVotes(votes: MonthDeskCandleVote[]): MonthDeskFusedCandleSignal {
  let longScore = 0;
  let shortScore = 0;
  const sourcesKo: string[] = [];
  for (const v of votes) {
    const w = Math.max(0.05, v.weight);
    if (v.direction === 'LONG') longScore += w;
    else if (v.direction === 'SHORT') shortScore += w;
    if (sourcesKo.length < 12 && !sourcesKo.includes(v.source)) sourcesKo.push(v.source);
  }
  const total = longScore + shortScore;
  const edge = longScore - shortScore;
  const minEdge = total > 0 ? Math.max(0.35, total * 0.12) : 0.5;
  let direction: 'LONG' | 'SHORT' | 'WAIT' = 'WAIT';
  if (edge >= minEdge) direction = 'LONG';
  else if (-edge >= minEdge) direction = 'SHORT';
  const confidencePct =
    total > 0 ? Math.round((Math.max(longScore, shortScore) / total) * 100) : 50;
  const tierKo =
    confidencePct >= 72 && Math.abs(edge) >= minEdge * 1.35
      ? '우세'
      : confidencePct >= 58
        ? '관찰'
        : '약';
  const label =
    direction === 'LONG'
      ? `◈L·${confidencePct}`
      : direction === 'SHORT'
        ? `◈S·${confidencePct}`
        : `◈↔·${confidencePct}`;
  return { direction, longScore, shortScore, confidencePct, label, tierKo, sourcesKo };
}

/** 마지막 봉 구간: 엔진·확정·마감·구조 등에서 연합 투표 수집 */
export type MonthDeskBandTouchLike = {
  time: number;
  verdict: 'LONG' | 'SHORT';
  tier?: 'A' | 'B' | 'C';
};

export function buildMonthDeskTailVoteMap(params: {
  candles: Candle[];
  fuseBarTimes: Set<number>;
  analysis: AnalyzeResponse | null;
  analysisMatches: boolean;
  locked: Map<number, 'LONG' | 'SHORT'>;
  rsiOnly: Map<number, 'LONG' | 'SHORT'>;
  structureRockets: Array<{ time: number; direction: 'LONG' | 'SHORT' }>;
  chartBias: 'LONG' | 'SHORT' | null;
  monthDeskClosingScenario: ClosingEnvelopeFuturesScenario | null;
  monthDeskStructurePick: MonthDeskStructurePickLike;
  monthDeskConfirmed: MonthDeskConfirmedInput | null | undefined;
  bandTouches?: MonthDeskBandTouchLike[];
  showRsi?: boolean;
  showMacdPanel?: boolean;
  showBbPanel?: boolean;
}): Map<number, MonthDeskCandleVote[]> {
  const {
    candles,
    fuseBarTimes,
    analysis,
    analysisMatches,
    locked,
    rsiOnly,
    structureRockets,
    chartBias,
    monthDeskClosingScenario,
    monthDeskStructurePick,
    monthDeskConfirmed,
    bandTouches,
    showRsi,
    showMacdPanel,
    showBbPanel,
  } = params;
  const map = new Map<number, MonthDeskCandleVote[]>();
  if (!candles.length || fuseBarTimes.size === 0) return map;

  const periodFallback = 3600;
  const lastT = Number(candles[candles.length - 1]!.time);

  for (let ci = 0; ci < candles.length; ci++) {
    const t = Number(candles[ci]!.time);
    if (!fuseBarTimes.has(t)) continue;
    const rangeEnd =
      ci + 1 < candles.length ? Number(candles[ci + 1]!.time) : t + periodFallback;
    let v: 'LONG' | 'SHORT' | undefined;
    for (const [lockedTime, dir] of locked) {
      if (t <= lockedTime && lockedTime < rangeEnd) {
        v = dir;
        break;
      }
    }
    if (!v) {
      for (const [rsiTime, dir] of rsiOnly) {
        if (t <= rsiTime && rsiTime < rangeEnd) {
          v = dir;
          break;
        }
      }
    }
    if (chartBias && v && v !== chartBias && t !== lastT) {
      v = undefined;
    }
    if (v === 'LONG') addVote(map, t, { direction: 'LONG', weight: 1.15, source: '확정·RSI L' });
    if (v === 'SHORT') addVote(map, t, { direction: 'SHORT', weight: 1.15, source: '확정·RSI S' });

    for (const rk of structureRockets) {
      if (t <= rk.time && rk.time < rangeEnd) {
        addVote(map, t, {
          direction: rk.direction,
          weight: 1.4,
          source: rk.direction === 'LONG' ? '구조 로켓' : '구조 숏 로켓',
        });
        break;
      }
    }
  }

  if (analysisMatches && analysis) {
    const a = analysis as AnalyzeResponse;
    const af = a.aiFusionSignal;
    if (af && (af.verdict === 'LONG' || af.verdict === 'SHORT')) {
      addVote(map, lastT, {
        direction: af.verdict,
        weight: af.tier === 'confirmed' ? 2.2 : af.tier === 'likely' ? 1.6 : 1.1,
        source: `AI연합 ${af.tier ?? ''}`.trim(),
      });
    }
    const cs = a.confirmedSignal;
    if (cs?.confirmed && cs.direction) {
      addVote(map, lastT, {
        direction: cs.direction,
        weight: 2.4,
        source: '5요소 확정',
      });
    } else if (typeof cs?.gatesPassCount === 'number' && cs.gatesPassCount >= 4) {
      const vd = a.verdict;
      if (vd === 'LONG' || vd === 'SHORT') {
        addVote(map, lastT, {
          direction: vd,
          weight: 1.5,
          source: `확정후보 ${cs.gatesPassCount}/5`,
        });
      }
    }
    const zsig = (a as { zoneSignal?: { zone?: string } }).zoneSignal;
    if (zsig?.zone === 'long_confirm') {
      addVote(map, lastT, { direction: 'LONG', weight: 1.35, source: '존 L확정' });
    } else if (zsig?.zone === 'short_confirm') {
      addVote(map, lastT, { direction: 'SHORT', weight: 1.35, source: '존 S확정' });
    }
    const settle = (a as { settlementZone?: { state?: string; direction?: string } }).settlementZone;
    if (settle?.state === 'confirmed') {
      const d =
        settle.direction === 'LONG' || settle.direction === 'SHORT' ? settle.direction : null;
      if (d) addVote(map, lastT, { direction: d, weight: 1.25, source: '안착 확정' });
    }
    const st = (a as { structureState?: { state?: string } }).structureState;
    if (st?.state === 'reversal') {
      addVote(map, lastT, { direction: 'NEUTRAL', weight: 0.6, source: '구조 밀림' });
    }
    const fr = (a as { frontRunSignal?: { state?: string; direction?: string } }).frontRunSignal;
    if (
      fr?.state === 'TRIGGERED' &&
      (fr.direction === 'LONG' || fr.direction === 'SHORT')
    ) {
      addVote(map, lastT, { direction: fr.direction, weight: 1.45, source: '선확정' });
    }
    const so = a.smartOverlay ?? null;
    const conf = (so as { confirmation?: { headline?: string } } | null)?.confirmation?.headline;
    if (conf === 'BULL_CONFIRM') {
      addVote(map, lastT, { direction: 'LONG', weight: 1.2, source: '스마트 롱확정' });
    } else if (conf === 'BEAR_CONFIRM') {
      addVote(map, lastT, { direction: 'SHORT', weight: 1.2, source: '스마트 숏확정' });
    }

    const safe = candles;
    if (safe.length >= 1) {
      const profile = buildProfileFromPanelFeatures(DEFAULT_UNIFIED_PANEL_FEATURES, {
        showRsiIndicators: showRsi,
        showMacdPanel: showMacdPanel,
        showBbPanel: showBbPanel,
      });
      const fusion = buildUnifiedLsSignal(
        a,
        profile,
        safe.length >= 30 ? { candles: safe } : undefined,
      );
      if (fusion.direction === 'LONG' || fusion.direction === 'SHORT') {
        addVote(map, lastT, {
          direction: fusion.direction,
          weight: 1.1 + fusion.edge / 120,
          source: `통합⋈ ${fusion.grade}`,
        });
      }
    }
  }

  if (monthDeskClosingScenario && fuseBarTimes.has(lastT)) {
    const b = monthDeskClosingScenario.bias;
    if (b === 'LONG' || b === 'SHORT') {
      addVote(map, lastT, { direction: b, weight: 1.55, source: '마감 시나리오' });
    }
    const v = monthDeskClosingScenario.lastVerdict;
    if (v === '안착') {
      addVote(map, lastT, {
        direction: b === 'SHORT' ? 'SHORT' : b === 'LONG' ? 'LONG' : 'NEUTRAL',
        weight: 1.2,
        source: '★타점·안착',
      });
    } else if (v === '실패') {
      addVote(map, lastT, { direction: 'NEUTRAL', weight: 0.9, source: '★무효·실패' });
    } else if (v === '불안') {
      addVote(map, lastT, { direction: 'NEUTRAL', weight: 0.7, source: '△마감·불안' });
    }
  }

  if (monthDeskConfirmed?.confirmed && monthDeskConfirmed.direction) {
    addVote(map, lastT, {
      direction: monthDeskConfirmed.direction,
      weight: 2.1,
      source: '마감존 확정',
    });
  }

  for (const bt of bandTouches ?? []) {
    const t = Number(bt.time);
    if (!fuseBarTimes.has(t)) continue;
    const w = bt.tier === 'A' ? 1.55 : bt.tier === 'B' ? 1.25 : 1.05;
    addVote(map, t, {
      direction: bt.verdict,
      weight: w,
      source: `기관밴드 ${bt.verdict === 'LONG' ? 'LP' : 'SP'}`,
    });
  }

  const sp = monthDeskStructurePick;
  if (sp && fuseBarTimes.has(Number(sp.barTime))) {
    const st = Number(sp.barTime);
    const bull = sp.highlight.bias === 'bullish';
    const phase = sp.highlight.phase;
    const w =
      phase === 'confirmed' ? 1.5 : phase === 'breakout' ? 1.35 : phase === 'failed' ? 0.85 : 1.05;
    addVote(map, st, {
      direction: bull ? 'LONG' : 'SHORT',
      weight: w,
      source: `구조 ${phase}`,
    });
  }

  return map;
}

export function createMonthDeskUnifiedCandleMarker(
  barTime: number,
  fused: MonthDeskFusedCandleSignal,
  isLastBar: boolean,
): ChartMarkerLike & { id: string } {
  const pos =
    fused.direction === 'LONG' ? 'belowBar' : fused.direction === 'SHORT' ? 'aboveBar' : 'inBar';
  const color =
    fused.direction === 'LONG' ? '#4ade80' : fused.direction === 'SHORT' ? '#fb7185' : '#fbbf24';
  return {
    time: barTime,
    position: pos as 'belowBar' | 'aboveBar' | 'inBar',
    shape: 'square',
    color,
    text: fused.label,
    size: isLastBar ? 3 : 2,
    id: 'month-desk-unified-candle-ls',
  };
}

export function isObPreBeamChartMarker(m: { text?: string }): boolean {
  const tx = String(m.text ?? '').trim();
  return /^[◎○]OB/.test(tx) || (/^[▲▼]/.test(tx) && /빔/.test(tx));
}

/**
 * 마지막 N봉: 로켓·밴드 터치만 남기고 나머지 캔들 마커 제거 → 연합 ◈L/◈S 추가.
 */
export function consolidateMonthDeskTailMarkers<T extends ChartMarkerLike>(params: {
  markers: T[];
  candles: Candle[];
  fuseBarCount?: number;
  voteMap: Map<number, MonthDeskCandleVote[]>;
}): T[] {
  const { markers, candles, fuseBarCount = 2, voteMap } = params;
  const fuseTimes = monthDeskFuseBarTimes(candles, fuseBarCount);
  if (!fuseTimes.size) return markers;

  const lastT = Number(candles[candles.length - 1]!.time);
  const kept: T[] = [];

  for (const m of markers) {
    const t = typeof m.time === 'number' ? m.time : Number((m.time as { timestamp?: number }).timestamp);
    if (!fuseTimes.has(t)) {
      kept.push(m);
      continue;
    }
    if (isMonthDeskRocketMarker(m) || isMonthDeskBandMarker(m) || isObPreBeamChartMarker(m)) {
      kept.push(m);
    }
  }

  for (const t of fuseTimes) {
    const votes = voteMap.get(t) ?? [];
    if (!votes.length) continue;
    const fused = fuseMonthDeskCandleVotes(votes);
    if (fused.direction === 'WAIT' && fused.confidencePct < 55) continue;
    kept.push(createMonthDeskUnifiedCandleMarker(t, fused, t === lastT) as T);
  }

  return stripMonthDeskLastBarClashMarkers(kept, candles);
}

/** 마지막 봉에 위·아래 동시 신호(롱·숏 로켓 등)가 겹치면 해당 봉의 로켓·◈·밴드참고·⚡ 마커 숨김 */
export function stripMonthDeskLastBarClashMarkers<T extends ChartMarkerLike>(
  markers: T[],
  candles: Candle[],
): T[] {
  if (!candles.length) return markers;
  const lastT = Number(candles[candles.length - 1]!.time);
  if (!Number.isFinite(lastT)) return markers;

  const barTime = (m: T) => {
    const t = m.time;
    return typeof t === 'number' ? t : Number((t as { timestamp?: number }).timestamp);
  };

  const onLast = markers.filter((m) => barTime(m) === lastT);
  const hasLongBelow = onLast.some(
    (m) =>
      m.position === 'belowBar' &&
      (isMonthDeskRocketMarker(m) ||
        String(m.id) === 'month-desk-unified-candle-ls' ||
        String(m.id) === 'month-desk-band-trend-last' ||
        /^◈L/.test(String(m.text ?? '').trim())),
  );
  const hasShortAbove = onLast.some(
    (m) =>
      m.position === 'aboveBar' &&
      (isMonthDeskRocketMarker(m) ||
        String(m.id) === 'month-desk-unified-candle-ls' ||
        String(m.id) === 'month-desk-band-trend-last' ||
        /^◈S/.test(String(m.text ?? '').trim())),
  );
  const clash = hasLongBelow && hasShortAbove;
  if (!clash) return markers;

  return markers.filter((m) => {
    if (barTime(m) !== lastT) return true;
    if (isMonthDeskRocketMarker(m)) return false;
    const id = String(m.id || '');
    if (id === 'month-desk-unified-candle-ls' || id === 'month-desk-band-trend-last') return false;
    const tx = String(m.text ?? '').trim();
    if (m.shape === 'square' && (/^◈/.test(tx) || tx.includes('⚡'))) return false;
    return true;
  });
}

export function monthDeskUnifiedCandleDetailLines(fused: MonthDeskFusedCandleSignal): string[] {
  const dir =
    fused.direction === 'LONG' ? '롱' : fused.direction === 'SHORT' ? '숏' : '중립·관망';
  return [
    `연합 캔들 신호: ${dir} · ${fused.tierKo} · 강도 ${fused.confidencePct}%`,
    `롱점수 ${fused.longScore.toFixed(2)} / 숏점수 ${fused.shortScore.toFixed(2)}`,
    ...fused.sourcesKo.slice(0, 10).map((s) => `· ${s}`),
    '로켓·기관밴드 터치는 개별 유지 — 나머지는 이 봉에서 연합 연산.',
  ];
}
