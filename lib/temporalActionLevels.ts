import type { AnalyzeResponse } from '@/types';
import { buildMonthDeskCoreLevels, type MonthDeskCoreLevels } from '@/lib/monthDeskCoreLevels';

export type TemporalTradeLevel = {
  key: string;
  label: string;
  price: number | null;
  priceHigh?: number | null;
  distPct: number | null;
  distKo: string;
  color: string;
  role: 'entry' | 'stop' | 'tp' | 'close' | 'past';
};

export type TemporalPathTarget = {
  path: string;
  prob: number;
  direction: string;
  target: number | null;
};

export type TemporalActionPlan = {
  verdict: 'LONG' | 'SHORT' | 'WAIT';
  close: number | null;
  entrySource: string;
  stopSource: string;
  targetSource: string;
  levels: MonthDeskCoreLevels;
  rows: TemporalTradeLevel[];
  pathTargets: TemporalPathTarget[];
  pastSimilar: {
    entry: number | null;
    stop: number | null;
    target: number | null;
    similarity: number;
  } | null;
  summaryKo: string;
};

function num(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function parsePriceStr(s: string | undefined | null): number | null {
  if (!s?.trim()) return null;
  const m = s.match(/[\d,]+(?:\.\d+)?/);
  if (!m) return null;
  return num(parseFloat(m[0].replace(/,/g, '')));
}

function pctDist(close: number, target: number): number {
  return ((target - close) / close) * 100;
}

function fmtPct(n: number): string {
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toFixed(2)}%`;
}

function fmtPx(n: number): string {
  return n >= 1000 ? n.toLocaleString(undefined, { maximumFractionDigits: 2 }) : n.toFixed(2);
}

function fmtRange(lo: number | null, hi: number | null): string {
  if (lo == null && hi == null) return '—';
  if (lo == null || hi == null) return fmtPx((lo ?? hi) as number);
  return `${fmtPx(Math.min(lo, hi))} ~ ${fmtPx(Math.max(lo, hi))}`;
}

function row(
  key: string,
  label: string,
  price: number | null,
  close: number | null,
  color: string,
  role: TemporalTradeLevel['role'],
  priceHigh?: number | null
): TemporalTradeLevel {
  if (price == null || close == null || close <= 0) {
    return { key, label, price, priceHigh, distPct: null, distKo: '—', color, role };
  }
  const d = pctDist(close, price);
  return { key, label, price, priceHigh, distPct: d, distKo: fmtPct(d), color, role };
}

/** 과거·현재·미래 비교 맥락 — 핵심 타점·손절·TP1~3 */
export function buildTemporalActionPlan(analysis: AnalyzeResponse | null): TemporalActionPlan | null {
  if (!analysis) return null;

  const verdict =
    analysis.verdict === 'LONG' || analysis.verdict === 'SHORT' ? analysis.verdict : ('WAIT' as const);
  const close = num(analysis.currentPrice);
  const levels = buildMonthDeskCoreLevels(analysis, null, close);

  let entryLo = levels.entryLow;
  let entryHi = levels.entryHigh;
  let entryMid = levels.entryMid;
  let entrySource = '엔진 타점 구간';

  const parsedEntry = parsePriceStr(analysis.entry);
  if (entryLo == null && entryHi == null && parsedEntry != null) {
    entryMid = parsedEntry;
    entrySource = '분석 entry 문자열';
  }

  const beam = analysis.beamPathForecast;
  if (beam?.points?.length && verdict !== 'WAIT') {
    const pt = beam.points[0];
    const beamPx = verdict === 'LONG' ? pt.expectedPriceLong : pt.expectedPriceShort;
    if (beamPx > 0) {
      if (entryMid == null) entryMid = beamPx;
      entrySource = `빔 +${pt.horizon}봉 ${verdict === 'LONG' ? '롱' : '숏'} 예상가`;
    }
  }

  let stop = levels.invalidation;
  let stopSource = stop != null ? '무효·invalidation' : '—';
  const parsedStop = parsePriceStr(analysis.stopLoss);
  if (stop == null && parsedStop != null) {
    stop = parsedStop;
    stopSource = '분석 stopLoss';
  }
  if (stop == null && verdict === 'LONG' && levels.support != null) {
    stop = levels.support;
    stopSource = '지지 이탈 기준';
  }
  if (stop == null && verdict === 'SHORT' && levels.resistance != null) {
    stop = levels.resistance;
    stopSource = '저항 이탈 기준';
  }

  const targets = [...levels.targets];
  let targetSource = targets.length ? '엔진 targets' : '—';

  const paths = analysis.futurePaths ?? [];
  const pathTargets: TemporalPathTarget[] = paths.slice(0, 3).map((p) => ({
    path: p.path,
    prob: p.probability,
    direction: p.direction,
    target: p.targets?.[0] ?? null,
  }));

  const dominantPath = [...paths].sort((a, b) => b.probability - a.probability)[0];
  if (dominantPath?.targets?.[0] != null) {
    if (targets.length === 0) targets.push(dominantPath.targets[0]);
    if (dominantPath.targets[1] != null && targets.length < 2) targets.push(dominantPath.targets[1]);
    if (dominantPath.targets[2] != null && targets.length < 3) targets.push(dominantPath.targets[2]);
    targetSource = `미래 경로 ${dominantPath.path} (${dominantPath.probability}%)`;
  }

  if (targets.length === 0 && verdict === 'LONG' && levels.resistance != null) {
    targets.push(levels.resistance);
    targetSource = '저항 재테스트';
  }
  if (targets.length === 0 && verdict === 'SHORT' && levels.support != null) {
    targets.push(levels.support);
    targetSource = '지지 재테스트';
  }

  const tp1 = targets[0] ?? null;
  const tp2 = targets[1] ?? null;
  const tp3 = targets[2] ?? null;

  const sim = analysis.similarBriefing;
  const pastSimilar =
    sim && (sim.similarity ?? 0) > 0
      ? {
          entry: num(sim.entry),
          stop: num(sim.stop),
          target: num(sim.target1),
          similarity: sim.similarity,
        }
      : null;

  const entryColor = verdict === 'LONG' ? '#4ade80' : verdict === 'SHORT' ? '#f87171' : '#a78bfa';
  const rows: TemporalTradeLevel[] = [
    row('close', '현재가', close, close, '#f8fafc', 'close'),
    row('entry', '★ 핵심 타점', entryMid ?? entryLo ?? entryHi, close, entryColor, 'entry', entryHi ?? entryMid),
    row('stop', '⛔ 손절·무효', stop, close, '#f87171', 'stop'),
    row('tp1', 'TP1', tp1, close, '#38bdf8', 'tp'),
    row('tp2', 'TP2', tp2, close, '#38bdf8', 'tp'),
    row('tp3', 'TP3', tp3, close, '#38bdf8', 'tp'),
  ];

  if (entryLo != null && entryHi != null && entryLo !== entryHi) {
    rows[1].price = entryLo;
    rows[1].priceHigh = entryHi;
  }

  let summaryKo = '방향·타점 데이터 로드 후 표시됩니다.';
  if (verdict !== 'WAIT' && close != null) {
    const entryTxt =
      entryLo != null && entryHi != null ? fmtRange(entryLo, entryHi) : entryMid != null ? fmtPx(entryMid) : '—';
    summaryKo = `미래 ${verdict === 'LONG' ? '롱' : '숏'} · 타점 ${entryTxt} · 손절 ${stop != null ? fmtPx(stop) : '—'} · TP1 ${tp1 != null ? fmtPx(tp1) : '—'}`;
  } else if (close != null) {
    summaryKo = `관망 — 타점 ${entryMid != null ? fmtPx(entryMid) : '—'} · 손절 ${stop != null ? fmtPx(stop) : '—'}`;
  }

  return {
    verdict,
    close,
    entrySource,
    stopSource,
    targetSource,
    levels: {
      ...levels,
      entryLow: entryLo,
      entryHigh: entryHi,
      entryMid: entryMid,
      invalidation: stop ?? levels.invalidation,
      targets: [tp1, tp2, tp3].filter((p): p is number => p != null),
    },
    rows,
    pathTargets,
    pastSimilar,
    summaryKo,
  };
}

export function fmtTemporalLevelPrice(r: TemporalTradeLevel): string {
  if (r.price == null) return '—';
  if (r.priceHigh != null && r.priceHigh !== r.price) {
    return `${fmtPx(Math.min(r.price, r.priceHigh))} ~ ${fmtPx(Math.max(r.price, r.priceHigh))}`;
  }
  return fmtPx(r.price);
}
