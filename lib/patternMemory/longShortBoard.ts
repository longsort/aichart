/**
 * 패턴기억 롱/숏 보드 — 유사구간 이후 결과·가중 투표·기울기.
 * 미래 누수 금지: hit 창 + horizon 이 asOfIndex 보다 앞에만 사용.
 * 확정 수익·투자 권유 아님.
 */
import { EAGLE1_MIN_STAT_SAMPLE } from '@/lib/eagle1/noFakeNumbers';
import type { SimilarityHit, StoredCandle } from '@/lib/patternMemory/types';

export type AftermathDir = 'LONG' | 'SHORT' | 'FLAT';

export type HitWithAftermath = SimilarityHit & {
  /** +3봉 종가 기준 */
  after3Pct: number | null;
  after5Pct: number | null;
  after10Pct: number | null;
  /** 가중 다수결: 3·5·10봉 */
  nextDir: AftermathDir | null;
  nextDirKo: string;
};

export type DirectionVote = {
  up: number;
  down: number;
  flat: number;
  sample: number;
  /** 상승 비율 0~1 (flat 제외) */
  pLong: number | null;
  /** cosine 가중 상승 비율 */
  pLongWeighted: number | null;
  direction: 'LONG' | 'SHORT' | null;
  lean: 'LONG' | 'SHORT' | 'WAIT';
  labelKo: string;
};

export type LongShortBoard = {
  /** 가격 모양 투표 */
  candle: DirectionVote;
  /** 가격+거래량 투표 */
  volume: DirectionVote;
  /** 3·5·10봉 합산(가격 모델 우선, 부족 시 거래량) */
  combined: DirectionVote;
  /** 첫 도달 TP/SL (있으면) */
  firstTouch: {
    tp: number;
    sl: number;
    decided: number;
    lean: 'LONG' | 'SHORT' | 'WAIT';
    labelKo: string;
  } | null;
  /** 타임프레임 롱/숏 표 */
  mtf: { longN: number; shortN: number; waitN: number; lean: 'LONG' | 'SHORT' | 'WAIT'; labelKo: string };
  /** 종합 기울기 — WAIT여도 어느 쪽인지 보이게 */
  lean: 'LONG' | 'SHORT' | 'WAIT';
  leanScore: number;
  leanKo: string;
  leanExplainKo: string;
  /** 확정 쪽과 기울기가 같으면 true */
  agreesWithVerdict: boolean;
  evidence: string[];
};

function closePct(candles: StoredCandle[], i: number, bars: number): number | null {
  const a = candles[i];
  const b = candles[i + bars];
  if (!a || !b || !(a.close > 0)) return null;
  return (b.close - a.close) / a.close;
}

function dirFromPct(pct: number | null, flatEps = 0.0008): AftermathDir | null {
  if (pct == null || !Number.isFinite(pct)) return null;
  if (Math.abs(pct) < flatEps) return 'FLAT';
  return pct > 0 ? 'LONG' : 'SHORT';
}

function majorityDir(dirs: (AftermathDir | null)[]): AftermathDir | null {
  let up = 0;
  let down = 0;
  let flat = 0;
  for (const d of dirs) {
    if (d === 'LONG') up += 1;
    else if (d === 'SHORT') down += 1;
    else if (d === 'FLAT') flat += 1;
  }
  if (up === 0 && down === 0 && flat === 0) return null;
  if (up > down && up >= flat) return 'LONG';
  if (down > up && down >= flat) return 'SHORT';
  if (flat >= up && flat >= down) return 'FLAT';
  return up === down ? 'FLAT' : up > down ? 'LONG' : 'SHORT';
}

export function enrichHitsWithAftermath(
  hits: SimilarityHit[],
  candles: StoredCandle[],
  asOfIndex: number
): HitWithAftermath[] {
  const byTime = new Map(candles.map((c, i) => [c.openTime, i]));
  return hits.map((h) => {
    const i = byTime.get(h.openTime);
    if (i == null || i >= asOfIndex) {
      return {
        ...h,
        after3Pct: null,
        after5Pct: null,
        after10Pct: null,
        nextDir: null,
        nextDirKo: '결과없음',
      };
    }
    const after3Pct = i + 3 < asOfIndex ? closePct(candles, i, 3) : null;
    const after5Pct = i + 5 < asOfIndex ? closePct(candles, i, 5) : null;
    const after10Pct = i + 10 < asOfIndex ? closePct(candles, i, 10) : null;
    const nextDir = majorityDir([dirFromPct(after3Pct), dirFromPct(after5Pct), dirFromPct(after10Pct)]);
    const nextDirKo =
      nextDir === 'LONG' ? '이후↑롱쪽' : nextDir === 'SHORT' ? '이후↓숏쪽' : nextDir === 'FLAT' ? '이후횡보' : '결과없음';
    return { ...h, after3Pct, after5Pct, after10Pct, nextDir, nextDirKo };
  });
}

function emptyVote(): DirectionVote {
  return {
    up: 0,
    down: 0,
    flat: 0,
    sample: 0,
    pLong: null,
    pLongWeighted: null,
    direction: null,
    lean: 'WAIT',
    labelKo: '표본 부족',
  };
}

/** +3봉 종가 기준 투표 (기존 directionFromHits와 동일 축 + 가중) */
export function voteFromHits(
  hits: SimilarityHit[],
  candles: StoredCandle[],
  asOfIndex: number,
  horizonBars = 3
): DirectionVote {
  const byTime = new Map(candles.map((c, i) => [c.openTime, i]));
  let up = 0;
  let down = 0;
  let flat = 0;
  let wUp = 0;
  let wDown = 0;
  for (const h of hits) {
    const i = byTime.get(h.openTime);
    if (i == null || i + horizonBars >= asOfIndex || i >= asOfIndex) continue;
    const pct = closePct(candles, i, horizonBars);
    const d = dirFromPct(pct);
    const w = Math.max(0.05, h.cosine);
    if (d === 'LONG') {
      up += 1;
      wUp += w;
    } else if (d === 'SHORT') {
      down += 1;
      wDown += w;
    } else if (d === 'FLAT') {
      flat += 1;
    }
  }
  const sample = up + down;
  const pLong = sample > 0 ? up / sample : null;
  const wSum = wUp + wDown;
  const pLongWeighted = wSum > 0 ? wUp / wSum : null;
  const leanBase = pLongWeighted ?? pLong;
  let direction: 'LONG' | 'SHORT' | null = null;
  let lean: 'LONG' | 'SHORT' | 'WAIT' = 'WAIT';
  if (sample >= EAGLE1_MIN_STAT_SAMPLE && leanBase != null) {
    if (leanBase >= 0.55) {
      direction = 'LONG';
      lean = 'LONG';
    } else if (leanBase <= 0.45) {
      direction = 'SHORT';
      lean = 'SHORT';
    }
  } else if (sample >= 12 && leanBase != null) {
    if (leanBase >= 0.58) lean = 'LONG';
    else if (leanBase <= 0.42) lean = 'SHORT';
  } else if (sample >= 6 && leanBase != null) {
    if (leanBase >= 0.62) lean = 'LONG';
    else if (leanBase <= 0.38) lean = 'SHORT';
  }
  const pctLabel = leanBase != null ? `${(leanBase * 100).toFixed(0)}%` : '—';
  const leanKo = lean === 'LONG' ? '롱쪽' : lean === 'SHORT' ? '숏쪽' : '갈림';
  const labelKo =
    sample < 6
      ? `표본 ${sample} · 부족`
      : `${leanKo} ${pctLabel} (↑${up}/↓${down}${flat ? ` ·횡${flat}` : ''})`;
  return { up, down, flat, sample, pLong, pLongWeighted, direction, lean, labelKo };
}

function mergeVotes(a: DirectionVote, b: DirectionVote): DirectionVote {
  const up = a.up + b.up;
  const down = a.down + b.down;
  const flat = a.flat + b.flat;
  const sample = up + down;
  const pLong = sample > 0 ? up / sample : null;
  const parts: number[] = [];
  if (a.pLongWeighted != null && a.sample > 0) parts.push(a.pLongWeighted);
  if (b.pLongWeighted != null && b.sample > 0) parts.push(b.pLongWeighted);
  const pLongWeighted = parts.length ? parts.reduce((s, x) => s + x, 0) / parts.length : pLong;
  const leanBase = pLongWeighted ?? pLong;
  let direction: 'LONG' | 'SHORT' | null = null;
  let lean: 'LONG' | 'SHORT' | 'WAIT' = 'WAIT';
  if (sample >= EAGLE1_MIN_STAT_SAMPLE && leanBase != null) {
    if (leanBase >= 0.55) {
      direction = 'LONG';
      lean = 'LONG';
    } else if (leanBase <= 0.45) {
      direction = 'SHORT';
      lean = 'SHORT';
    }
  } else if (sample >= 12 && leanBase != null) {
    if (leanBase >= 0.56) lean = 'LONG';
    else if (leanBase <= 0.44) lean = 'SHORT';
  }
  const pctLabel = leanBase != null ? `${(leanBase * 100).toFixed(0)}%` : '—';
  const leanKo = lean === 'LONG' ? '롱쪽' : lean === 'SHORT' ? '숏쪽' : '갈림';
  return {
    up,
    down,
    flat,
    sample,
    pLong,
    pLongWeighted,
    direction,
    lean,
    labelKo: sample < 6 ? `합산 표본 ${sample} · 부족` : `합산 ${leanKo} ${pctLabel} (↑${up}/↓${down})`,
  };
}

export function buildLongShortBoard(params: {
  candleHits: SimilarityHit[];
  volumeHits: SimilarityHit[];
  candles: StoredCandle[];
  asOfIndex: number;
  firstTouchTp?: number;
  firstTouchSl?: number;
  mtfVerdicts?: string[];
  spotClosePct?: number | null;
  hardVerdict: 'LONG' | 'SHORT' | 'WAIT';
}): LongShortBoard {
  const candle = voteFromHits(params.candleHits, params.candles, params.asOfIndex, 3);
  const volume = voteFromHits(params.volumeHits, params.candles, params.asOfIndex, 3);
  const candle5 = voteFromHits(params.candleHits, params.candles, params.asOfIndex, 5);
  const candle10 = voteFromHits(params.candleHits, params.candles, params.asOfIndex, 10);
  const combined = mergeVotes(mergeVotes(candle, volume), mergeVotes(candle5, candle10));

  const ftDecided = (params.firstTouchTp ?? 0) + (params.firstTouchSl ?? 0);
  let firstTouch: LongShortBoard['firstTouch'] = null;
  if (ftDecided >= 8) {
    const tp = params.firstTouchTp ?? 0;
    const sl = params.firstTouchSl ?? 0;
    const tpRate = tp / ftDecided;
    let lean: 'LONG' | 'SHORT' | 'WAIT' = 'WAIT';
    /** first-touch는 가정 방향 기준이라 hardVerdict 쪽 신뢰만 보강 */
    if (params.hardVerdict === 'LONG' || params.hardVerdict === 'SHORT') {
      lean = tpRate >= 0.55 ? params.hardVerdict : tpRate <= 0.45 ? (params.hardVerdict === 'LONG' ? 'SHORT' : 'LONG') : 'WAIT';
    }
    firstTouch = {
      tp,
      sl,
      decided: ftDecided,
      lean,
      labelKo: `첫도달 TP ${tp} / SL ${sl} (${(tpRate * 100).toFixed(0)}% TP)`,
    };
  }

  const mtfList = params.mtfVerdicts ?? [];
  const longN = mtfList.filter((v) => v === 'LONG').length;
  const shortN = mtfList.filter((v) => v === 'SHORT').length;
  const waitN = mtfList.filter((v) => v !== 'LONG' && v !== 'SHORT').length;
  let mtfLean: 'LONG' | 'SHORT' | 'WAIT' = 'WAIT';
  if (longN > shortN + 0) mtfLean = 'LONG';
  else if (shortN > longN + 0) mtfLean = 'SHORT';
  const mtf = {
    longN,
    shortN,
    waitN,
    lean: mtfLean,
    labelKo: `TF 롱${longN} · 숏${shortN} · 관망${waitN}`,
  };

  /** 점수: + = 롱, - = 숏 */
  let score = 0;
  const evidence: string[] = [];
  const pushVote = (v: DirectionVote, w: number, name: string) => {
    if (v.sample < 6 || v.pLongWeighted == null) return;
    const edge = (v.pLongWeighted - 0.5) * 2; // -1~+1
    score += edge * w;
    evidence.push(`${name} ${v.labelKo}`);
  };
  pushVote(candle, 1.2, '가격모양');
  pushVote(volume, 1.4, '가격+거래량');
  pushVote(candle5, 0.9, '+5봉');
  pushVote(candle10, 0.7, '+10봉');
  if (mtfLean === 'LONG') {
    score += 0.25 * Math.min(1, longN / Math.max(1, longN + shortN));
    evidence.push(mtf.labelKo);
  } else if (mtfLean === 'SHORT') {
    score -= 0.25 * Math.min(1, shortN / Math.max(1, longN + shortN));
    evidence.push(mtf.labelKo);
  }
  if (params.spotClosePct != null && Number.isFinite(params.spotClosePct)) {
    const edge = Math.max(-1, Math.min(1, params.spotClosePct / 2));
    score += edge * 0.35;
    evidence.push(`유사후 종가중앙 ${params.spotClosePct >= 0 ? '+' : ''}${params.spotClosePct.toFixed(2)}%`);
  }
  if (firstTouch && firstTouch.lean !== 'WAIT') {
    score += firstTouch.lean === 'LONG' ? 0.2 : -0.2;
    evidence.push(firstTouch.labelKo);
  }

  const leanScore = Math.round(Math.max(-100, Math.min(100, score * 100)));
  let lean: 'LONG' | 'SHORT' | 'WAIT' = 'WAIT';
  if (leanScore >= 18) lean = 'LONG';
  else if (leanScore <= -18) lean = 'SHORT';

  const leanKo =
    lean === 'LONG' ? '롱 쪽 기울기' : lean === 'SHORT' ? '숏 쪽 기울기' : '양쪽 갈림·관망';
  const leanExplainKo =
    lean === 'WAIT'
      ? `지금은 확정이 어렵습니다. 기울기 점수 ${leanScore} (대략 -100~+100, +면 롱). 참고용.`
      : lean === 'LONG'
        ? `비슷한 과거가 이후 상승한 쪽이 더 많습니다(기울기 ${leanScore}). 확정 매수 신호 아님.`
        : `비슷한 과거가 이후 하락한 쪽이 더 많습니다(기울기 ${leanScore}). 확정 매도 신호 아님.`;

  return {
    candle: candle.sample ? candle : emptyVote(),
    volume: volume.sample ? volume : emptyVote(),
    combined,
    firstTouch,
    mtf,
    lean,
    leanScore,
    leanKo,
    leanExplainKo,
    agreesWithVerdict:
      params.hardVerdict === 'WAIT' ? lean === 'WAIT' : params.hardVerdict === lean || lean === 'WAIT',
    evidence: evidence.slice(0, 8),
  };
}
