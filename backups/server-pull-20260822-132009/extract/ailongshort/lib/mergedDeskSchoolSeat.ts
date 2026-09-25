/**
 * 통합·분석 — 다학파 ‘지금 자리’ 근사.
 * 와이코프·엘리엇·다우·고전패턴·하모닉·VSA·일목·찬론·SMC·Brooks·피보·
 * Wolfe·Pitchfork·프로파일·P&F·Nison·터틀/달바스·장기국면.
 * 확정 파동·승률 보장 아님. 조건부 해석.
 */
import type { AnalyzeResponse, Candle } from '@/types';
import { detectZigzagPivots, type ZigzagPivot } from '@/lib/candleAnalysisElliottMvp';
import { detectAllHarmonics, type HarmonicPatternName } from '@/lib/harmonic';
import { detectPO3Phase, detectSLHunt } from '@/lib/smc';
import { getDominantPattern, runPatternVision } from '@/lib/patternVision/patternVisionEngine';
import type { MergedSmcLeadingContext } from '@/lib/mergedAnalysisSmcLeading';
import type { MergedDeskWyckoffRead } from '@/lib/mergedDeskWyckoffCycle';
import type { MergedDeskElliottRead } from '@/lib/mergedDeskElliottWave';

export type SchoolSeatKind =
  | 'seat'
  | 'wyckoff'
  | 'elliott'
  | 'dow'
  | 'classical'
  | 'harmonic'
  | 'vsa'
  | 'ichimoku'
  | 'chan'
  | 'smc'
  | 'brooks'
  | 'fib'
  | 'wolfe'
  | 'pitchfork'
  | 'profile'
  | 'pnf'
  | 'nison'
  | 'turtle'
  | 'macro';

export type SchoolSeatTone = 'bull' | 'bear' | 'neutral';

export type MergedDeskSchoolSeat = {
  kind: SchoolSeatKind;
  tagKo: string;
  headlineKo: string;
  detailKo: string;
  confidence: number;
  tone: SchoolSeatTone;
};

const MIN = 40;

const VISION_KO: Record<string, string> = {
  'Double Top': '이중천장',
  'Double Bottom': '이중바닥',
  'Triple Top': '삼중천장',
  'Triple Bottom': '삼중바닥',
  'Head and Shoulders': '헤드앤숄더',
  'Inverse Head and Shoulders': '역헤드앤숄더',
  'Bull Flag': '상승깃발',
  'Bear Flag': '하락깃발',
  'Rising Wedge': '상승쐐기',
  'Falling Wedge': '하락쐐기',
  'Ascending Triangle': '상승삼각',
  'Descending Triangle': '하락삼각',
  'Symmetrical Triangle': '대칭삼각',
  'Broadening Formation': '확대형',
  Range: '레인지',
  'Cup and Handle': '컵핸들',
  'Cup & Handle': '컵핸들',
  'Channel Up': '상승채널',
  'Channel Down': '하락채널',
  'V Bottom': 'V바닥',
  'V Top': 'V천장',
};

const HARM_KO: Record<HarmonicPatternName, string> = {
  butterfly: '나비',
  bat: '박쥐',
  gartley: 'Gartley',
  crab: '크랩',
  altBat: 'Alt박쥐',
  deepCrab: '깊은크랩',
  cypher: 'Cypher',
  shark: 'Shark',
};

function atr14(candles: Candle[]): number {
  const n = candles.length;
  if (n < 3) return 0;
  const from = Math.max(1, n - 14);
  let s = 0;
  let c = 0;
  for (let i = from; i < n; i++) {
    const a = candles[i]!;
    const p = candles[i - 1]!;
    s += Math.max(a.high - a.low, Math.abs(a.high - p.close), Math.abs(a.low - p.close));
    c++;
  }
  return c > 0 ? s / c : Math.max(1e-12, candles[n - 1]!.high - candles[n - 1]!.low);
}

function volAvg(candles: Candle[], n = 20): number {
  const w = candles.slice(-n);
  if (!w.length) return 0;
  return w.reduce((a, c) => a + (c.volume ?? 0), 0) / w.length;
}

function donchian(candles: Candle[], period: number, end: number): { hh: number; ll: number } {
  const from = Math.max(0, end - period + 1);
  let hh = -Infinity;
  let ll = Infinity;
  for (let i = from; i <= end; i++) {
    hh = Math.max(hh, candles[i]!.high);
    ll = Math.min(ll, candles[i]!.low);
  }
  return { hh, ll };
}

function swingsFromZigzag(pivots: ZigzagPivot[]): Array<{ type: 'high' | 'low'; index: number; price: number }> {
  return pivots.map((p) => ({ type: p.isHigh ? 'high' : 'low', index: p.idx, price: p.price }));
}

function seat(
  kind: SchoolSeatKind,
  tagKo: string,
  headlineKo: string,
  detailKo: string,
  confidence: number,
  tone: SchoolSeatTone
): MergedDeskSchoolSeat {
  return { kind, tagKo, headlineKo, detailKo, confidence: Math.max(MIN, Math.min(88, confidence)), tone };
}

function detectDow(pivots: ZigzagPivot[]): MergedDeskSchoolSeat | null {
  if (pivots.length < 4) return null;
  const seq = pivots.slice(-6);
  const highs = seq.filter((p) => p.isHigh);
  const lows = seq.filter((p) => !p.isHigh);
  if (highs.length < 2 || lows.length < 2) return null;
  const h1 = highs[highs.length - 2]!.price;
  const h2 = highs[highs.length - 1]!.price;
  const l1 = lows[lows.length - 2]!.price;
  const l2 = lows[lows.length - 1]!.price;
  const hhhl = h2 > h1 && l2 > l1;
  const lhll = h2 < h1 && l2 < l1;
  if (hhhl) {
    return seat('dow', '다우', '지금은 다우 상승추세(HH·HL) 진행', '주추세 상승 근사. 2차 조정·소파동은 하위 TF. 확정 아님.', 62, 'bull');
  }
  if (lhll) {
    return seat('dow', '다우', '지금은 다우 하락추세(LH·LL) 진행', '주추세 하락 근사. 반등 구간은 2차 조정 후보. 확정 아님.', 62, 'bear');
  }
  const brokeHigh = l2 > l1 && h2 > h1 * 0.998 && seq[seq.length - 1]!.isHigh;
  if (brokeHigh && lhll === false && h2 >= h1) {
    return seat('dow', '다우123', '지금은 다우 123 상방전환 후보', '하락 후 직전 고점 돌파형 123 근사. 무효화=저점 이탈. 확정 아님.', 58, 'bull');
  }
  const brokeLow = h2 < h1 && l2 < l1 * 1.002 && !seq[seq.length - 1]!.isHigh;
  if (brokeLow) {
    return seat('dow', '다우123', '지금은 다우 123 하방전환 후보', '상승 후 직전 저점 이탈형 123 근사. 무효화=고점 회복. 확정 아님.', 58, 'bear');
  }
  return seat('dow', '다우', '지금은 다우 혼조·횡보', '고·저점 갱신이 엇갈림. 주추세 대기. 확정 아님.', 48, 'neutral');
}

function elliottSeat(read: MergedDeskElliottRead | null | undefined): MergedDeskSchoolSeat | null {
  if (!read || read.confidence < MIN) return null;
  return seat(
    'elliott',
    '엘리엇',
    `지금은 ${read.headlineKo}`,
    read.detailKo,
    read.confidence,
    read.bias === 'bullish' ? 'bull' : 'bear'
  );
}

function detectElliott(pivots: ZigzagPivot[]): MergedDeskSchoolSeat | null {
  if (pivots.length < 4) return null;
  const seq = pivots.slice(-8);
  if (seq.length >= 5) {
    const w = seq.slice(-5);
    const alt = w.every((p, i) => i === 0 || p.isHigh !== w[i - 1]!.isHigh);
    if (alt) {
      const legs: number[] = [];
      for (let i = 1; i < w.length; i++) legs.push(Math.abs(w[i]!.price - w[i - 1]!.price));
      const w1 = legs[0] ?? 0;
      const w3 = legs[2] ?? 0;
      const w5 = legs[3] ?? 0;
      if (w3 >= Math.min(w1, w5 || w3) * 0.9) {
        const lastHigh = w[w.length - 1]!.isHigh;
        return seat(
          'elliott',
          '엘리엇',
          `지금은 엘리엇 충격 1–5 ${lastHigh ? '상방' : '하방'} 근사`,
          '5스윙 충격파 후보. 카운트 무효화 가능. 확정 아님.',
          56,
          lastHigh ? 'bull' : 'bear'
        );
      }
    }
  }
  if (seq.length >= 5) {
    const a = seq[seq.length - 5]!;
    const b = seq[seq.length - 4]!;
    const c = seq[seq.length - 3]!;
    const d = seq[seq.length - 2]!;
    const e = seq[seq.length - 1]!;
    const contracting =
      Math.abs(c.price - b.price) < Math.abs(a.price - (seq[seq.length - 6]?.price ?? a.price)) &&
      Math.abs(e.price - d.price) < Math.abs(c.price - b.price);
    if (contracting && a.isHigh !== b.isHigh) {
      return seat('elliott', '엘리엇삼각', '지금은 엘리엇 삼각조정 근사', 'ABCDE 수축 후보. 이탈 방향 미확정.', 52, 'neutral');
    }
  }
  if (seq.length >= 3) {
    const a = seq[seq.length - 3]!;
    const b = seq[seq.length - 2]!;
    const c = seq[seq.length - 1]!;
    if (a.isHigh !== b.isHigh && b.isHigh !== c.isHigh) {
      const deepB = Math.abs(b.price - a.price) > Math.abs(c.price - b.price) * 0.9;
      return seat(
        'elliott',
        deepB ? '엘리엇플랫' : '엘리엇ABC',
        deepB ? '지금은 엘리엇 플랫조정 근사' : '지금은 엘리엇 지그재그(ABC) 근사',
        '3스윙 조정 후보. 재개·연장 모두 열어둠. 확정 아님.',
        50,
        'neutral'
      );
    }
  }
  return null;
}

function detectClassical(candles: Candle[], analysis?: AnalyzeResponse | null): MergedDeskSchoolSeat | null {
  const cached = analysis?.detectedVisionPatterns?.[0];
  const fromAnalysis = analysis?.dominantPattern?.type
    ? analysis.dominantPattern
    : cached?.type
      ? cached
      : null;
  const vis = fromAnalysis ?? (candles.length >= 40 ? getDominantPattern(runPatternVision(candles)) : null);
  if (!vis || (vis.confidence ?? 0) < 62) return null;
  const name = VISION_KO[vis.type] ?? vis.type;
  const bias = String(vis.bias || 'neutral');
  const tone: SchoolSeatTone = bias === 'bullish' ? 'bull' : bias === 'bearish' ? 'bear' : 'neutral';
  return seat(
    'classical',
    name,
    `지금은 ${name} 진행`,
    `${name} 고전 패턴 근사(${vis.confidence}%). 넥라인·이탈 검증 필요. 확정 아님.`,
    Math.round(vis.confidence * 0.85),
    tone
  );
}

function detectHarmonic(candles: Candle[], pivots: ZigzagPivot[]): MergedDeskSchoolSeat | null {
  const swings = swingsFromZigzag(pivots).slice(-20);
  if (swings.length < 8) return null;
  const hits = detectAllHarmonics(candles, swings);
  if (!hits.length) {
    if (pivots.length >= 4) {
      const a = pivots[pivots.length - 4]!;
      const b = pivots[pivots.length - 3]!;
      const c = pivots[pivots.length - 2]!;
      const d = pivots[pivots.length - 1]!;
      const ab = Math.abs(b.price - a.price);
      const cd = Math.abs(d.price - c.price);
      if (ab > 0 && Math.abs(cd / ab - 1) < 0.18 && a.isHigh !== b.isHigh) {
        return seat('harmonic', 'AB=CD', '지금은 AB=CD 하모닉 근사', '등변 측정이동. D는 PRZ 후보일 뿐. 확정 아님.', 52, d.isHigh ? 'bear' : 'bull');
      }
    }
    return null;
  }
  const best = [...hits].sort((x, y) => y.score - x.score)[0]!;
  const name = HARM_KO[best.pattern] ?? best.pattern;
  const nearD = Math.abs(candles.length - 1 - best.d) <= 8;
  return seat(
    'harmonic',
    name,
    `지금은 하모닉 ${name} ${nearD ? 'D근처' : '형성'} 진행`,
    `XABCD ${best.bias === 'bullish' ? '강세' : '약세'} 근사. 피보 비율 허용오차 있음. 확정 아님.`,
    Math.round(48 + best.score * 28),
    best.bias === 'bullish' ? 'bull' : 'bear'
  );
}

function detectVsa(candles: Candle[]): MergedDeskSchoolSeat | null {
  if (candles.length < 24) return null;
  const atr = atr14(candles);
  const va = volAvg(candles, 24);
  const last = candles[candles.length - 1]!;
  const rng = last.high - last.low;
  const vol = last.volume ?? 0;
  if (!(atr > 0) || !(va > 0)) return null;
  if (vol >= va * 2.1 && rng >= atr * 1.7) {
    const down = last.close < last.open;
    return seat(
      'vsa',
      'VSA',
      `지금은 VSA ${down ? '매도' : '매수'}클라이맥스 후보`,
      '넓은 스프레드+거래량 급증. 소진·지속 모두 가능. 확정 아님.',
      60,
      down ? 'bull' : 'bear'
    );
  }
  if (vol >= va * 1.9 && rng <= atr * 0.85) {
    return seat('vsa', 'VSA흡수', '지금은 VSA 흡수(노력대비결과 약) 진행', '거래량 큰데 범위 작음. 반대 세력 흡수 후보. 확정 아님.', 56, 'neutral');
  }
  if (last.close >= last.open && rng <= atr * 0.55 && vol <= va * 0.72) {
    return seat('vsa', 'VSA무수요', '지금은 VSA 무수요봉 후보', '상승봉인데 범위·거래량 빈약. 상방 약화 힌트. 확정 아님.', 52, 'bear');
  }
  if (last.close < last.open && rng <= atr * 0.55 && vol <= va * 0.72) {
    return seat('vsa', 'VSA무공급', '지금은 VSA 무공급봉 후보', '하락봉인데 범위·거래량 빈약. 하방 약화 힌트. 확정 아님.', 52, 'bull');
  }
  return null;
}

function detectIchimoku(candles: Candle[]): MergedDeskSchoolSeat | null {
  const n = candles.length;
  if (n < 52) return null;
  const i = n - 1;
  const t = donchian(candles, 9, i);
  const k = donchian(candles, 26, i);
  const b = donchian(candles, 52, i);
  const tenkan = (t.hh + t.ll) / 2;
  const kijun = (k.hh + k.ll) / 2;
  const spanA = (tenkan + kijun) / 2;
  const spanB = (b.hh + b.ll) / 2;
  const top = Math.max(spanA, spanB);
  const bot = Math.min(spanA, spanB);
  const close = candles[i]!.close;
  if (close > top) {
    return seat('ichimoku', '일목', '지금은 일목 구름 위(강세국면) 자리', `전환 ${tenkan >= kijun ? '>' : '<'} 기준. 구름 안착·이탈은 별도 확인.`, 64, 'bull');
  }
  if (close < bot) {
    return seat('ichimoku', '일목', '지금은 일목 구름 아래(약세국면) 자리', `전환 ${tenkan >= kijun ? '>' : '<'} 기준. 구름 안착·이탈은 별도 확인.`, 64, 'bear');
  }
  return seat('ichimoku', '일목', '지금은 일목 구름 안(혼조) 자리', '선행스팬 사이. 방향 대기 구간. 확정 아님.', 54, 'neutral');
}

function detectChan(pivots: ZigzagPivot[]): MergedDeskSchoolSeat | null {
  if (pivots.length < 6) return null;
  const last = pivots.slice(-6);
  const ranges: Array<[number, number]> = [];
  for (let i = 0; i < last.length - 1; i++) {
    const a = last[i]!.price;
    const b = last[i + 1]!.price;
    ranges.push([Math.min(a, b), Math.max(a, b)]);
  }
  let overlap = 0;
  for (let i = 0; i < ranges.length - 2; i++) {
    const lo = Math.max(ranges[i]![0], ranges[i + 1]![0], ranges[i + 2]![0]);
    const hi = Math.min(ranges[i]![1], ranges[i + 1]![1], ranges[i + 2]![1]);
    if (hi > lo) overlap++;
  }
  if (overlap > 0) {
    return seat('chan', '찬론', '지금은 찬론 중추 진행', '분형→필 이후 3중첩 중추 근사. 이탈=추세구간. 확정 아님.', 55, 'neutral');
  }
  const rising = last[last.length - 1]!.price > last[0]!.price;
  return seat('chan', '찬론필', `지금은 찬론 ${rising ? '상' : '하'}필 진행`, '중추 성립 전 일방향 필 근사. 매매점 1·2·3은 중추 이후. 확정 아님.', 50, rising ? 'bull' : 'bear');
}

function detectSmc(
  candles: Candle[],
  pivots: ZigzagPivot[],
  smcLeading?: MergedSmcLeadingContext | null
): MergedDeskSchoolSeat | null {
  const po3 = detectPO3Phase(candles);
  const swings = swingsFromZigzag(pivots);
  const hunts = detectSLHunt(
    candles,
    swings.filter((s) => s.type === 'high').slice(-5),
    swings.filter((s) => s.type === 'low').slice(-5)
  );
  const mark = smcLeading?.lastChoch;
  if (mark) {
    const tag = mark.tag === 'CHOCH' ? 'CHoCH' : mark.tag;
    const dir = mark.bias === 'bullish' ? '↑' : '↓';
    const phase =
      mark.phase === 'confirmed' ? '안착' : mark.phase === 'settling' ? '안착중' : mark.developing ? '진행' : '대기';
    return seat(
      'smc',
      'SMC',
      `지금은 SMC ${tag}${dir} ${phase} 자리`,
      `${smcLeading?.summaryKo || '구조 마크'} · BOS누적 ${smcLeading?.bosCountInLeg ?? 0}. 확정 아님.`,
      mark.phase === 'confirmed' ? 68 : 60,
      mark.bias === 'bullish' ? 'bull' : 'bear'
    );
  }
  if (hunts.length) {
    const h = hunts[hunts.length - 1]!;
    return seat(
      'smc',
      '스윕',
      `지금은 SMC ${h.side === 'sell' ? 'SSL' : 'BSL'} 스윕 직후 자리`,
      '유동성 헌트 후 회귀 후보. 구조 확인 필요. 확정 아님.',
      58,
      h.side === 'sell' ? 'bull' : 'bear'
    );
  }
  if (po3) {
    const ko = po3 === 'accumulation' ? 'PO3 축적' : po3 === 'manipulation' ? 'PO3 조작' : 'PO3 분산';
    return seat(
      'smc',
      'PO3',
      `지금은 ${ko} 자리`,
      'ICT 축적·조작·분산 근사. 와이코프 TR과 겹칠 수 있음. 확정 아님.',
      54,
      po3 === 'accumulation' ? 'bull' : po3 === 'distribution' ? 'bear' : 'neutral'
    );
  }
  return null;
}

function detectBrooks(candles: Candle[]): MergedDeskSchoolSeat | null {
  if (candles.length < 16) return null;
  const atr = atr14(candles);
  if (!(atr > 0)) return null;
  const last8 = candles.slice(-8);
  const hi = Math.max(...last8.map((c) => c.high));
  const lo = Math.min(...last8.map((c) => c.low));
  if (hi - lo <= atr * 1.15) {
    return seat('brooks', 'Brooks', '지금은 Brooks 타이트레인지 진행', '좁은 봉 군집. 돌파 실패·추세 재개 모두 가능. 확정 아님.', 58, 'neutral');
  }
  const last = candles[candles.length - 1]!;
  if (last.high - last.low >= atr * 1.85) {
    const down = last.close < last.open;
    return seat(
      'brooks',
      'Brooks클맥',
      `지금은 Brooks ${down ? '하락' : '상승'}클라이맥스봉 후보`,
      '장대 클라이맥스. 반전·지속 모두 열어둠. 확정 아님.',
      55,
      down ? 'bull' : 'bear'
    );
  }
  const lows = candles.slice(-12).map((c) => c.low);
  const highs = candles.slice(-12).map((c) => c.high);
  const hl2 = lows[lows.length - 1]! > lows[lows.length - 4]! && lows[lows.length - 4]! > lows[0]!;
  const lh2 = highs[highs.length - 1]! < highs[highs.length - 4]! && highs[highs.length - 4]! < highs[0]!;
  if (hl2) return seat('brooks', 'H2', '지금은 Brooks H2(두 번째 상승시도) 자리', '고저점 상승 중 두 번째 눌림 근사. 확정 아님.', 52, 'bull');
  if (lh2) return seat('brooks', 'L2', '지금은 Brooks L2(두 번째 하락시도) 자리', '고저점 하락 중 두 번째 반등 근사. 확정 아님.', 52, 'bear');
  return null;
}

function detectFib(candles: Candle[], pivots: ZigzagPivot[]): MergedDeskSchoolSeat | null {
  if (pivots.length < 2) return null;
  const a = pivots[pivots.length - 2]!;
  const b = pivots[pivots.length - 1]!;
  const span = b.price - a.price;
  if (Math.abs(span) < 1e-12) return null;
  const close = candles[candles.length - 1]!.close;
  const retr = (b.price - close) / span;
  const r = Math.abs(retr);
  if (r >= 0.35 && r <= 0.66) {
    return seat('fib', '피보', '지금은 피보 GP(0.38–0.62) 되돌림 자리', '측정이동 전 황금되돌림 구간. 지지·저항 전환은 조건부.', 60, span > 0 ? 'bull' : 'bear');
  }
  if (r >= 0.95 && r <= 1.08) {
    return seat('fib', '측정이동', '지금은 측정이동(AB≈CD) 완성 근처', '1.0 확장 부근. 목표·소진 모두 가능. 확정 아님.', 56, span > 0 ? 'bear' : 'bull');
  }
  if (r >= 1.2 && r <= 1.72) {
    return seat('fib', '확장', '지금은 피보 1.27–1.62 확장 자리', '추세 확장 구간. 과열·지속 구분 필요. 확정 아님.', 52, span > 0 ? 'bull' : 'bear');
  }
  return null;
}

function detectWolfe(pivots: ZigzagPivot[]): MergedDeskSchoolSeat | null {
  if (pivots.length < 5) return null;
  const w = pivots.slice(-5);
  const alt = w.every((p, i) => i === 0 || p.isHigh !== w[i - 1]!.isHigh);
  if (!alt) return null;
  const d13 = Math.abs(w[2]!.price - w[0]!.price);
  const d35 = Math.abs(w[4]!.price - w[2]!.price);
  const d24 = Math.abs(w[3]!.price - w[1]!.price);
  if (d13 > 0 && d35 < d13 * 0.92 && d24 > 0) {
    return seat('wolfe', 'Wolfe', '지금은 Wolfe Wave 5점 수렴 근사', '1-3-5 / 2-4 수렴 후보. EPA는 추정. 확정 아님.', 50, w[4]!.isHigh ? 'bear' : 'bull');
  }
  return null;
}

function detectPitchfork(pivots: ZigzagPivot[], close: number): MergedDeskSchoolSeat | null {
  if (pivots.length < 3) return null;
  const p0 = pivots[pivots.length - 3]!;
  const p1 = pivots[pivots.length - 2]!;
  const p2 = pivots[pivots.length - 1]!;
  const mid = (p1.price + p2.price) / 2;
  const upper = Math.max(p1.price, p2.price);
  const lower = Math.min(p1.price, p2.price);
  const width = upper - lower;
  if (!(width > 0)) return null;
  if (close > upper) return seat('pitchfork', 'Pitchfork', '지금은 앤드류스 상단 이탈·회귀 자리', `기준점 ${p0.isHigh ? '고' : '저'} 피치포크 근사. 확정 아님.`, 50, 'bear');
  if (close < lower) return seat('pitchfork', 'Pitchfork', '지금은 앤드류스 하단 이탈·회귀 자리', '피치포크 하단 밖. 회귀·추세가속 모두 가능.', 50, 'bull');
  if (Math.abs(close - mid) <= width * 0.18) {
    return seat('pitchfork', 'Pitchfork', '지금은 앤드류스 중앙선 자리', '미디언 근처. 자석·통과 모두 가능. 확정 아님.', 48, 'neutral');
  }
  return null;
}

function detectProfile(candles: Candle[]): MergedDeskSchoolSeat | null {
  const w = candles.slice(-60);
  if (w.length < 24) return null;
  const lo = Math.min(...w.map((c) => c.low));
  const hi = Math.max(...w.map((c) => c.high));
  const span = hi - lo;
  if (!(span > 0)) return null;
  const bins = 24;
  const vol = new Array<number>(bins).fill(0);
  for (const c of w) {
    const mid = (c.high + c.low) / 2;
    const bi = Math.min(bins - 1, Math.max(0, Math.floor(((mid - lo) / span) * bins)));
    vol[bi] += c.volume ?? 1;
  }
  let pocI = 0;
  for (let i = 1; i < bins; i++) if (vol[i]! > vol[pocI]!) pocI = i;
  const total = vol.reduce((a, b) => a + b, 0);
  let acc = vol[pocI]!;
  let a = pocI;
  let b = pocI;
  while (acc < total * 0.7 && (a > 0 || b < bins - 1)) {
    const left = a > 0 ? vol[a - 1]! : -1;
    const right = b < bins - 1 ? vol[b + 1]! : -1;
    if (right >= left) {
      b++;
      acc += vol[b] ?? 0;
    } else {
      a--;
      acc += vol[a] ?? 0;
    }
  }
  const poc = lo + ((pocI + 0.5) / bins) * span;
  const vah = lo + ((b + 1) / bins) * span;
  const val = lo + (a / bins) * span;
  const close = candles[candles.length - 1]!.close;
  if (close > vah) return seat('profile', '프로파일', '지금은 VA 위(고가거래 밖) 자리', `POC근사 ${poc.toFixed(0)} · HVN/LVN은 단면. 확정 아님.`, 54, 'bull');
  if (close < val) return seat('profile', '프로파일', '지금은 VA 아래(저가거래 밖) 자리', `POC근사 · Value Area 이탈. 회귀·추세 모두 가능.`, 54, 'bear');
  return seat('profile', '프로파일', '지금은 Value Area 안(공정가치) 자리', '경매 균형 구간. 이탈 시 불균형. 확정 아님.', 52, 'neutral');
}

function detectPnf(candles: Candle[]): MergedDeskSchoolSeat | null {
  if (candles.length < 30) return null;
  const atr = atr14(candles);
  const box = atr * 0.28;
  if (!(box > 0)) return null;
  let col: 'X' | 'O' = candles[1]!.close >= candles[0]!.close ? 'X' : 'O';
  let extreme = candles[0]!.close;
  let flips = 0;
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i]!.close;
    if (col === 'X') {
      if (c >= extreme + box) extreme = c;
      else if (c <= extreme - 3 * box) {
        col = 'O';
        extreme = c;
        flips++;
      }
    } else if (c <= extreme - box) extreme = c;
    else if (c >= extreme + 3 * box) {
      col = 'X';
      extreme = c;
      flips++;
    }
  }
  return seat(
    'pnf',
    'P&F',
    `지금은 P&F ${col === 'X' ? 'X열(상승칸)' : 'O열(하락칸)'} 진행`,
    `3칸 반전 근사 · 열전환 ${flips}회. 와이코프 타깃 카운트용. 확정 아님.`,
    50,
    col === 'X' ? 'bull' : 'bear'
  );
}

function detectNison(candles: Candle[]): MergedDeskSchoolSeat | null {
  if (candles.length < 3) return null;
  const a = candles[candles.length - 3]!;
  const b = candles[candles.length - 2]!;
  const c = candles[candles.length - 1]!;
  const body = Math.abs(c.close - c.open);
  const rng = Math.max(1e-12, c.high - c.low);
  const upW = c.high - Math.max(c.open, c.close);
  const dnW = Math.min(c.open, c.close) - c.low;
  if (body <= rng * 0.12) {
    return seat('nison', '도지', '지금은 Nison 도지(균형) 자리', '개장≈종가. 추세 소진·지속 대기. 확정 아님.', 50, 'neutral');
  }
  if (dnW >= body * 2 && upW <= body * 0.6 && c.close > c.open) {
    return seat('nison', '망치', '지금은 Nison 망치형 자리', '아래꼬리 매수 방어. 추세 위치 확인 필요.', 54, 'bull');
  }
  if (upW >= body * 2 && dnW <= body * 0.6 && c.close < c.open) {
    return seat('nison', '유성', '지금은 Nison 유성형 자리', '위꼬리 매도 방어. 추세 위치 확인 필요.', 54, 'bear');
  }
  const bBody = Math.abs(b.close - b.open);
  const engulfUp = c.close > c.open && b.close < b.open && c.close >= b.open && c.open <= b.close && body > bBody;
  const engulfDn = c.close < c.open && b.close > b.open && c.close <= b.open && c.open >= b.close && body > bBody;
  if (engulfUp) return seat('nison', '잉태', '지금은 Nison 상승장악 자리', '전봉 하락을 장악. 1봉 힌트. 확정 아님.', 56, 'bull');
  if (engulfDn) return seat('nison', '잉태', '지금은 Nison 하락장악 자리', '전봉 상승을 장악. 1봉 힌트. 확정 아님.', 56, 'bear');
  const star =
    Math.abs(b.close - b.open) < Math.abs(a.close - a.open) * 0.55 &&
    ((a.close < a.open && c.close > c.open && c.close > (a.open + a.close) / 2) ||
      (a.close > a.open && c.close < c.open && c.close < (a.open + a.close) / 2));
  if (star) {
    const bull = c.close > c.open;
    return seat('nison', '별', `지금은 Nison ${bull ? '샛별' : '석별'} 근사`, '3봉 반전 도판. 위치·거래량 확인. 확정 아님.', 55, bull ? 'bull' : 'bear');
  }
  return null;
}

function detectTurtleDarvas(candles: Candle[]): MergedDeskSchoolSeat | null {
  if (candles.length < 24) return null;
  const last = candles[candles.length - 1]!;
  const prev = candles.slice(-21, -1);
  const hh = Math.max(...prev.map((c) => c.high));
  const ll = Math.min(...prev.map((c) => c.low));
  if (last.close > hh) {
    return seat('turtle', '터틀', '지금은 터틀 20봉 상방돌파 자리', '돈치안 상단 이탈. 추세추종 도식. 가짜돌파 가능.', 58, 'bull');
  }
  if (last.close < ll) {
    return seat('turtle', '터틀', '지금은 터틀 20봉 하방돌파 자리', '돈치안 하단 이탈. 추세추종 도식. 가짜돌파 가능.', 58, 'bear');
  }
  const box = candles.slice(-16);
  const bHi = Math.max(...box.map((c) => c.high));
  const bLo = Math.min(...box.map((c) => c.low));
  const atr = atr14(candles);
  if (atr > 0 && bHi - bLo <= atr * 3.2) {
    const nearTop = last.close >= bHi - atr * 0.25;
    const nearBot = last.close <= bLo + atr * 0.25;
    if (nearTop || nearBot) {
      return seat(
        'turtle',
        '달바스',
        `지금은 달바스 박스 ${nearTop ? '상단' : '하단'} 자리`,
        '박스 고·저 이탈 대기. 확정 아님.',
        52,
        nearTop ? 'bull' : 'bear'
      );
    }
  }
  return null;
}

function detectMacro(candles: Candle[]): MergedDeskSchoolSeat | null {
  const w = candles.length > 120 ? candles.slice(-120) : candles;
  if (w.length < 40) return null;
  const close = w[w.length - 1]!.close;
  const lo = Math.min(...w.map((c) => c.low));
  const hi = Math.max(...w.map((c) => c.high));
  const span = hi - lo;
  if (!(span > 0)) return null;
  const pct = (close - lo) / span;
  const slope = (close - w[0]!.close) / span;
  if (pct <= 0.22) {
    return seat('macro', '장기국면', '지금은 장기 사이클 하단(과매도권) 근사', 'Hurst/콘드라티예프가 아님. 윈도 내 상대위치. 확정 아님.', 48, 'bull');
  }
  if (pct >= 0.78) {
    return seat('macro', '장기국면', '지금은 장기 사이클 상단(과매수권) 근사', '윈도 내 상대위치. 분배·마크업 끝단과 겹칠 수 있음.', 48, 'bear');
  }
  if (slope > 0.25) return seat('macro', '장기국면', '지금은 장기 상승 국면 중반 근사', '넓은 창 우상향. 마크업과 동행 가능. 확정 아님.', 46, 'bull');
  if (slope < -0.25) return seat('macro', '장기국면', '지금은 장기 하락 국면 중반 근사', '넓은 창 우하향. 마크다운과 동행 가능. 확정 아님.', 46, 'bear');
  return seat('macro', '장기국면', '지금은 장기 사이클 중간 자리', '상대위치 중간. 큰 파동 전환점은 아님.', 44, 'neutral');
}

function wyckoffSeat(read: MergedDeskWyckoffRead | null): MergedDeskSchoolSeat | null {
  if (!read || read.confidence < MIN) return null;
  const tone: SchoolSeatTone =
    read.macro === 'accumulation' || read.macro === 'markup'
      ? 'bull'
      : read.macro === 'distribution' || read.macro === 'markdown'
        ? 'bear'
        : 'neutral';
  return seat('wyckoff', '와이코프', `지금은 ${read.headlineKo}`, read.detailKo, read.confidence, tone);
}

function synthesize(parts: MergedDeskSchoolSeat[]): MergedDeskSchoolSeat | null {
  if (!parts.length) return null;
  const pick = (k: SchoolSeatKind) => parts.find((p) => p.kind === k);
  const bits: string[] = [];
  const wk = pick('wyckoff');
  const dow = pick('dow');
  const ichi = pick('ichimoku');
  const fib = pick('fib');
  const smc = pick('smc');
  const cl = pick('classical');
  const harm = pick('harmonic');
  if (wk) bits.push(wk.headlineKo.replace(/^지금은\s*/, '').replace(/\s*진행$/, ''));
  if (dow) bits.push(dow.tagKo === '다우123' ? '다우123' : dow.headlineKo.includes('상승') ? '다우상승' : dow.headlineKo.includes('하락') ? '다우하락' : '다우혼조');
  if (ichi) bits.push(ichi.headlineKo.includes('위') ? '구름위' : ichi.headlineKo.includes('아래') ? '구름아래' : '구름안');
  if (fib) bits.push(fib.tagKo === '피보' ? 'GP되돌림' : fib.tagKo);
  if (smc) bits.push(smc.headlineKo.replace(/^지금은\s*/, '').replace(/\s*자리$/, ''));
  if (cl && bits.length < 5) bits.push(cl.tagKo);
  if (harm && bits.length < 5) bits.push(harm.tagKo);
  const headlineKo = `지금은 ${bits.slice(0, 4).join(' · ')} 자리`;
  const bull = parts.filter((p) => p.tone === 'bull').length;
  const bear = parts.filter((p) => p.tone === 'bear').length;
  const tone: SchoolSeatTone = bull > bear + 1 ? 'bull' : bear > bull + 1 ? 'bear' : 'neutral';
  const conf = Math.round(parts.reduce((s, p) => s + p.confidence, 0) / parts.length);
  return seat(
    'seat',
    '지금자리',
    headlineKo,
    parts
      .slice(0, 8)
      .map((p) => p.detailKo)
      .join(' · ') + ' — 학파 합류 근사, 확정 수익·승률 아님.',
    conf,
    tone
  );
}

export function detectMergedDeskSchoolSeats(params: {
  candles: Candle[];
  wyckoff?: MergedDeskWyckoffRead | null;
  elliott?: MergedDeskElliottRead | null;
  analysis?: AnalyzeResponse | null;
  smcLeading?: MergedSmcLeadingContext | null;
}): MergedDeskSchoolSeat[] {
  const candles = params.candles;
  if (candles.length < 24) return [];
  const pivots = detectZigzagPivots(candles, 4, 4);
  const close = candles[candles.length - 1]!.close;
  const raw = [
    wyckoffSeat(params.wyckoff ?? null),
    elliottSeat(params.elliott) ?? detectElliott(pivots),
    detectDow(pivots),
    detectClassical(candles, params.analysis),
    detectHarmonic(candles, pivots),
    detectVsa(candles),
    detectIchimoku(candles),
    detectChan(pivots),
    detectSmc(candles, pivots, params.smcLeading),
    detectBrooks(candles),
    detectFib(candles, pivots),
    detectWolfe(pivots),
    detectPitchfork(pivots, close),
    detectProfile(candles),
    detectPnf(candles),
    detectNison(candles),
    detectTurtleDarvas(candles),
    detectMacro(candles),
  ].filter((s): s is MergedDeskSchoolSeat => !!s && s.confidence >= MIN);

  const ranked = [...raw].sort((a, b) => b.confidence - a.confidence);
  const synth = synthesize(ranked);
  return synth ? [synth, ...ranked] : ranked;
}
