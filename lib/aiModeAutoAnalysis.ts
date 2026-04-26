import type { Candle } from '@/types';

/** 과거 터치 후 기대 방향 이어짐 비율 → 패널용 52~90 신뢰도 */
export function obProbabilityFromPastTouches(touchCount: number, successCount: number): number {
  if (touchCount <= 0) return 74;
  const rate = Math.max(0, Math.min(1, successCount / touchCount));
  return Math.round(52 + rate * 38);
}

/** AI 압축→장대 탐지용 ATR 배수 (쿼리/설정으로 덮어쓰기 가능) */
export type CompressionThresholds = {
  avgRangeAtr: number;
  maxRangeAtr: number;
  impulseRangeAtr: number;
  impulseBodyAtr: number;
};

export const DEFAULT_COMPRESSION_THRESHOLDS: CompressionThresholds = {
  avgRangeAtr: 0.5,
  maxRangeAtr: 0.65,
  impulseRangeAtr: 1.12,
  impulseBodyAtr: 0.48,
};

export function mergeCompressionThresholds(p?: Partial<CompressionThresholds>): CompressionThresholds {
  const base = { ...DEFAULT_COMPRESSION_THRESHOLDS };
  if (!p) return base;
  (['avgRangeAtr', 'maxRangeAtr', 'impulseRangeAtr', 'impulseBodyAtr'] as const).forEach((k) => {
    const v = p[k];
    if (typeof v === 'number' && Number.isFinite(v)) base[k] = v;
  });
  return base;
}

function median(nums: number[]): number {
  if (!nums.length) return 0;
  const a = [...nums].sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m]! : ((a[m - 1]! + a[m]!) / 2);
}

export type CompressionImpulseResult = {
  compressionStartIdx: number;
  compressionEndIdx: number;
  impulseIdx: number;
  boxLow: number;
  boxHigh: number;
  impulseBias: 'bullish' | 'bearish';
  barsCompressed: number;
};

/**
 * 직전 소폭 레인지 N봉(압축) 뒤 변위 봉(장대에 가까움) — 이미 발생한 패턴(사후)
 */
export function findLatestCompressionImpulse(
  candles: Candle[],
  atrVal: number,
  thIn?: Partial<CompressionThresholds>
): CompressionImpulseResult | null {
  const th = mergeCompressionThresholds(thIn);
  if (candles.length < 22 || !(atrVal > 0)) return null;
  const n = candles.length;
  const maxLookback = Math.min(140, n - 1);
  for (let impulseIdx = n - 1; impulseIdx >= Math.max(8, n - maxLookback); impulseIdx--) {
    const c = candles[impulseIdx]!;
    const range = c.high - c.low;
    const body = Math.abs(c.close - c.open);
    if (range < atrVal * th.impulseRangeAtr || body < atrVal * th.impulseBodyAtr) continue;
    const impulseBias: 'bullish' | 'bearish' = c.close >= c.open ? 'bullish' : 'bearish';
    for (const nb of [8, 7, 6, 5, 4, 3] as const) {
      const start = impulseIdx - nb;
      if (start < 0) continue;
      let sumR = 0;
      let maxR = 0;
      for (let j = start; j < impulseIdx; j++) {
        const r = candles[j]!.high - candles[j]!.low;
        sumR += r;
        if (r > maxR) maxR = r;
      }
      const avgR = sumR / nb;
      if (avgR > atrVal * th.avgRangeAtr) continue;
      if (maxR > atrVal * th.maxRangeAtr) continue;
      let low = Infinity;
      let high = -Infinity;
      for (let j = start; j < impulseIdx; j++) {
        low = Math.min(low, candles[j]!.low);
        high = Math.max(high, candles[j]!.high);
      }
      if (!Number.isFinite(low) || !Number.isFinite(high)) continue;
      return {
        compressionStartIdx: start,
        compressionEndIdx: impulseIdx - 1,
        impulseIdx,
        boxLow: low,
        boxHigh: high,
        impulseBias,
        barsCompressed: nb,
      };
    }
  }
  return null;
}

export type LiveCompressionResult = {
  score: number;
  barsN: number;
  boxLow: number;
  boxHigh: number;
  volumeDryUp: boolean;
  obConfluent: 'support' | 'resistance' | 'none';
  hint: string;
};

/**
 * 최근 막대들이 좁은 레인지로 쌓였는지(진행 중 압축) + 지지/저항 OB와 겹침
 */
export function evaluateLiveCompression(
  candles: Candle[],
  atrVal: number,
  thIn: Partial<CompressionThresholds> | undefined,
  opts: {
    volumeFilter: boolean;
    supportOb: { low: number; high: number } | null;
    resistanceOb: { low: number; high: number } | null;
    lastClose: number;
  }
): LiveCompressionResult | null {
  const th = mergeCompressionThresholds(thIn);
  if (candles.length < 14 || !(atrVal > 0)) return null;
  const n = candles.length;
  const volSample = candles.slice(-30).map((c) => c.volume).filter((v) => v > 0);
  const medVol = median(volSample.length ? volSample : [1]);

  let best: LiveCompressionResult | null = null;

  for (const nb of [8, 7, 6, 5, 4, 3] as const) {
    const start = n - nb;
    if (start < 0) continue;
    const ranges: number[] = [];
    const volsWin: number[] = [];
    for (let j = start; j < n; j++) {
      const c = candles[j]!;
      ranges.push(c.high - c.low);
      volsWin.push(Math.max(0, c.volume));
    }
    const avgR = ranges.reduce((a, b) => a + b, 0) / nb;
    const maxR = Math.max(...ranges);
    const capAvg = atrVal * th.avgRangeAtr;
    const capMax = atrVal * th.maxRangeAtr;
    if (avgR > capAvg || maxR > capMax) continue;

    let volOk = true;
    let volDry = false;
    if (opts.volumeFilter) {
      const below = volsWin.filter((v) => v <= medVol * 0.92).length;
      volOk = below >= Math.ceil(nb * 0.7);
      volDry = volOk;
    } else {
      volDry = volsWin.filter((v) => v <= medVol * 0.92).length >= Math.ceil(nb * 0.6);
    }
    if (!volOk) continue;

    let low = Infinity;
    let high = -Infinity;
    for (let j = start; j < n; j++) {
      low = Math.min(low, candles[j]!.low);
      high = Math.max(high, candles[j]!.high);
    }

    const avgRatio = avgR / Math.max(1e-12, capAvg);
    let score = Math.round(Math.min(100, 48 + (1 - Math.min(1, avgRatio)) * 52));

    /** 막대 레인지가 끝으로 갈수록 좁아지는 코일링이면 가산 */
    let coilBonus = 0;
    if (nb >= 4 && ranges.length >= 4) {
      const tail = ranges.slice(-4);
      if (tail[0]! >= tail[1]! && tail[1]! >= tail[2]! && tail[2]! >= tail[3]! && tail[0]! > tail[3]! * 1.08) {
        coilBonus = 7;
      }
    } else if (nb === 3 && ranges.length === 3) {
      if (ranges[0]! >= ranges[1]! && ranges[1]! >= ranges[2]! && ranges[0]! > ranges[2]! * 1.05) {
        coilBonus = 5;
      }
    }
    if (coilBonus > 0) {
      score = Math.min(100, score + coilBonus);
    }

    let obConfluent: 'support' | 'resistance' | 'none' = 'none';
    const sOb = opts.supportOb;
    const rOb = opts.resistanceOb;
    if (sOb) {
      const inBox = high >= sOb.low && low <= sOb.high;
      const priceIn = opts.lastClose >= sOb.low && opts.lastClose <= sOb.high;
      if (inBox || priceIn) {
        obConfluent = 'support';
        score = Math.min(100, score + 14);
      }
    }
    if (obConfluent === 'none' && rOb) {
      const inBox = high >= rOb.low && low <= rOb.high;
      const priceIn = opts.lastClose >= rOb.low && opts.lastClose <= rOb.high;
      if (inBox || priceIn) {
        obConfluent = 'resistance';
        score = Math.min(100, score + 12);
      }
    }

    const hint =
      obConfluent === 'support'
        ? '지지 OB와 겹침'
        : obConfluent === 'resistance'
          ? '저항 OB와 겹침'
          : 'OB 미겹침';

    const cand: LiveCompressionResult = {
      score,
      barsN: nb,
      boxLow: low,
      boxHigh: high,
      volumeDryUp: volDry,
      obConfluent,
      hint,
    };

    if (!best || cand.score > best.score || (cand.score === best.score && cand.barsN > best.barsN)) best = cand;
  }

  return best;
}

export type AiModeAutoAnalysisInput = {
  symbol: string;
  timeframe: string;
  verdict: string;
  nearestSupportOb: { low: number; high: number; probability: number; pastTouches?: number; pastHits?: number } | null;
  nearestResistanceOb: { low: number; high: number; probability: number; pastTouches?: number; pastHits?: number } | null;
  currentZoneSummary: string | null;
  earlyObAnalysis: string | null;
  compression: CompressionImpulseResult | null;
  liveCompression: LiveCompressionResult | null;
  visibleLength: number;
  volumeWhaleCaption?: string;
  buyPressure?: number;
  sellPressure?: number;
  volumeDelta?: number;
  pre3Matched?: boolean;
  pre3Similarity?: number;
  /** 서버: AI·고래 최강 프로파일 */
  aiModeMax?: boolean;
};

export type AiModeAutoAnalysisOut = {
  headline: string;
  bullets: string[];
  compression: {
    boxLow: number;
    boxHigh: number;
    barsCompressed: number;
    impulseBias: 'bullish' | 'bearish';
    barsAgo: number;
  } | null;
  liveCompression: LiveCompressionResult | null;
  flowLine?: string;
};

export function buildAiModeAutoAnalysis(p: AiModeAutoAnalysisInput): AiModeAutoAnalysisOut {
  const bullets: string[] = [];
  const v = p.verdict === 'LONG' ? '롱' : p.verdict === 'SHORT' ? '숏' : '관망';
  const mx = p.aiModeMax === true;
  const liveBulletMin = mx ? 36 : 42;

  if (p.nearestSupportOb) {
    const t = p.nearestSupportOb.pastTouches ?? 0;
    const h = p.nearestSupportOb.pastHits ?? 0;
    const pct = t > 0 ? Math.round((h / t) * 100) : null;
    bullets.push(
      pct != null
        ? `지지 OB ${p.nearestSupportOb.low.toLocaleString()}~${p.nearestSupportOb.high.toLocaleString()} · 과거 터치 ${t}회 중 방향 이어짐 ${h}회 (${pct}%) · 신뢰 ${p.nearestSupportOb.probability}%`
        : `지지 OB ${p.nearestSupportOb.low.toLocaleString()}~${p.nearestSupportOb.high.toLocaleString()} · 신뢰 ${p.nearestSupportOb.probability}%`
    );
  }
  if (p.nearestResistanceOb) {
    const t = p.nearestResistanceOb.pastTouches ?? 0;
    const h = p.nearestResistanceOb.pastHits ?? 0;
    const pct = t > 0 ? Math.round((h / t) * 100) : null;
    bullets.push(
      pct != null
        ? `저항 OB ${p.nearestResistanceOb.low.toLocaleString()}~${p.nearestResistanceOb.high.toLocaleString()} · 과거 터치 ${t}회 중 방향 이어짐 ${h}회 (${pct}%) · 신뢰 ${p.nearestResistanceOb.probability}%`
        : `저항 OB ${p.nearestResistanceOb.low.toLocaleString()}~${p.nearestResistanceOb.high.toLocaleString()} · 신뢰 ${p.nearestResistanceOb.probability}%`
    );
  }

  if (p.liveCompression && p.liveCompression.score >= liveBulletMin) {
    const lc = p.liveCompression;
    const volNote = lc.volumeDryUp ? ' · 거래량 축소' : '';
    bullets.push(
      `진행 압축 후보 · 최근 ${lc.barsN}봉 레인지 좁음 · 점수 ${lc.score}${volNote} · ${lc.hint}`
    );
  }

  if (p.compression) {
    const ago = p.visibleLength - 1 - p.compression.impulseIdx;
    const dirKo = p.compression.impulseBias === 'bullish' ? '장대 양봉' : '장대 음봉';
    bullets.push(
      `과거: 선반응(압축 ${p.compression.barsCompressed}봉) → ${dirKo} · 박스 ${p.compression.boxLow.toLocaleString()}~${p.compression.boxHigh.toLocaleString()} · 변위 ${ago}봉 전`
    );
  }

  if (p.earlyObAnalysis) bullets.push(`선포착: ${p.earlyObAnalysis}`);
  if (p.currentZoneSummary) bullets.push(p.currentZoneSummary);
  if (p.volumeWhaleCaption) bullets.push(`거래량·존: ${p.volumeWhaleCaption}`);

  let flowLine: string | undefined;
  if (p.buyPressure != null && p.sellPressure != null) {
    const bp = p.buyPressure <= 1.01 ? p.buyPressure * 100 : p.buyPressure;
    const sp = p.sellPressure <= 1.01 ? p.sellPressure * 100 : p.sellPressure;
    const net = bp - sp;
    const side = net > 6 ? '매수 우세' : net < -6 ? '매도 우세' : '중립';
    flowLine = `체결 압력 ${side} (매수 ${Math.round(bp)} · 매도 ${Math.round(sp)})`;
    if (p.volumeDelta != null && Number.isFinite(p.volumeDelta)) {
      flowLine += ` · Δ ${p.volumeDelta >= 0 ? '+' : ''}${Math.round(p.volumeDelta)}`;
    }
    bullets.push(flowLine);
  }

  if (p.pre3Matched && p.pre3Similarity != null) {
    bullets.push(`Pre3 유사 셋업 · 유사도 ${Math.round(p.pre3Similarity * 100)}%`);
  }

  const headline = `${p.symbol} ${p.timeframe} · AI 모드 자동 분석${mx ? ' · 최강' : ''} · ${v} (지지/압축/플로우)`;

  const compressionOut =
    p.compression != null
      ? {
          boxLow: p.compression.boxLow,
          boxHigh: p.compression.boxHigh,
          barsCompressed: p.compression.barsCompressed,
          impulseBias: p.compression.impulseBias,
          barsAgo: p.visibleLength - 1 - p.compression.impulseIdx,
        }
      : null;

  return {
    headline,
    bullets: bullets.length ? bullets : ['OB·압축·거래소 데이터가 부족하면 이 구간은 비어 있을 수 있습니다.'],
    compression: compressionOut,
    liveCompression: p.liveCompression && p.liveCompression.score >= liveBulletMin ? p.liveCompression : null,
    flowLine,
  };
}
