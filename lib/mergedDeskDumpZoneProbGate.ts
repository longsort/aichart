/**
 * 폭락존 터치 진입 게이트 — 터치마다 진입 금지.
 * · 신규 터치만 (직전봉은 존 밖)
 * · 종가 반응 (floor=지지홀드 · ceiling=저항홀드)
 * · 과거 터치→반등/거부 확률 ≥ 임계 (표본 부족이면 스킵)
 * 확정 승률·수익 아님.
 */
import type { Candle } from '@/types';
import { computePriceBandSrProb } from '@/lib/zoneSupportResistProb';
import { computeDumpZoneTouchStats } from '@/lib/mergedDeskDumpZoneTouchStats';

/** 진입 최소 홀드/반등·거부 확률 % */
export const DUMP_ZONE_HOLD_MIN_PCT = 60;

export type DumpZoneProbGateResult = {
  ok: boolean;
  holdPct: number | null;
  samples: number;
  labelKo: string;
  reasonKo: string;
};

function touches(c: Candle, bot: number, top: number): boolean {
  const hi = Number(c.high);
  const lo = Number(c.low);
  if (!(hi > 0) || !(lo > 0)) return false;
  return lo <= top && hi >= bot;
}

/**
 * closedIdx = 마감봉 인덱스 (진행봉 제외한 배열에서 마지막, 또는 n-2 패턴).
 */
export function evaluateDumpZoneTouchProbGate(params: {
  candles: Candle[];
  closedIdx: number;
  bot: number;
  top: number;
  mid?: number;
  bandRole: 'floor' | 'ceiling';
  minHoldPct?: number;
}): DumpZoneProbGateResult {
  const fail = (reasonKo: string, holdPct: number | null = null, samples = 0): DumpZoneProbGateResult => ({
    ok: false,
    holdPct,
    samples,
    labelKo: holdPct != null ? `${params.bandRole === 'ceiling' ? '거부' : '지지'}${holdPct}%` : '표본부족',
    reasonKo,
  });

  const candles = params.candles;
  const n = candles.length;
  const i = params.closedIdx;
  const bot = Math.min(params.bot, params.top);
  const top = Math.max(params.bot, params.top);
  const mid =
    Number(params.mid) > 0 ? Number(params.mid) : (bot + top) / 2;
  const minPct = Math.max(50, Math.min(85, params.minHoldPct ?? DUMP_ZONE_HOLD_MIN_PCT));
  const isCeiling = params.bandRole === 'ceiling';

  if (!(top > bot) || i < 2 || i >= n) {
    return fail('봉/존 데이터부족');
  }

  const closed = candles[i]!;
  const prev = candles[i - 1];
  const closePx = Number(closed.close);
  if (!(closePx > 0)) return fail('종가없음');

  if (!touches(closed, bot, top)) {
    return fail('마감봉 미터치');
  }
  /** 연속 터치 과진입 방지 — 직전봉이 이미 존이면 스킵 */
  if (prev && touches(prev, bot, top)) {
    return fail('연속터치스킵 · 신규접근만');
  }

  /** 종가 반응: 지지면 중앙 이상 · 저항이면 중앙 이하 */
  if (!isCeiling && closePx < mid) {
    return fail('지지미확인 · 종가중앙아래');
  }
  if (isCeiling && closePx > mid) {
    return fail('저항미확인 · 종가중앙위');
  }

  const hist = candles.slice(0, i + 1);
  const dumpStats = computeDumpZoneTouchStats({
    candles: hist,
    top,
    bot,
    mid,
    bandRole: params.bandRole,
  });
  const sr = computePriceBandSrProb(hist, bot, top, {
    endExclusive: hist.length,
    minSamples: 3,
  });

  let holdPct: number | null = null;
  let samples = 0;
  if (dumpStats.sampleOk && dumpStats.reactionPct != null) {
    holdPct = Math.round(dumpStats.reactionPct);
    samples = dumpStats.touchCount;
  } else if (!isCeiling && sr.supportProb != null) {
    holdPct = sr.supportProb;
    samples = sr.supportTouches;
  } else if (isCeiling && sr.resistanceProb != null) {
    holdPct = sr.resistanceProb;
    samples = sr.resistTouches;
  }

  if (holdPct == null) {
    return fail('표본부족 · 확률진입스킵', null, samples);
  }
  if (holdPct < minPct) {
    return fail(
      `${isCeiling ? '거부' : '지지'}${holdPct}%<${minPct}% · 진입스킵`,
      holdPct,
      samples
    );
  }

  const tag = isCeiling ? '거부' : '지지';
  return {
    ok: true,
    holdPct,
    samples,
    labelKo: `${tag}${holdPct}%`,
    reasonKo: `${tag}${holdPct}%≥${minPct}% · 신규터치 · 종가확인`,
  };
}
