/**
 * 폭락존 원칙 유지 — floor=지지 · ceiling=반등한도/저항.
 * 주경로 1세트: 확실지지 → 반등가능 → 저항 + 무효화 + 시나리오 상태 1개.
 * 존 mid/top/bot은 옮기지 않음. 확정 승률·수익 보장 아님.
 */
import type { Candle } from '@/types';
import { normalizeChartTimeframe, timeframeRank } from '@/lib/constants';
import type { DumpLifeState } from '@/lib/mergedDeskDumpLifeCycle';
import type { DumpBounceCap } from '@/lib/mergedDeskDumpCeilingReachStats';

export type DumpBandSnap = {
  sourceTf: string;
  sourceTfKo: string;
  bandRole?: 'floor' | 'ceiling';
  mid: number;
  top: number;
  bot: number;
  lifeState?: DumpLifeState;
  evidenceScore?: number;
};

/** 차트에 하나만 보여주는 반등 시나리오 상태 */
export type DumpPathScenario =
  | 'WATCH'
  | 'BOUNCE'
  | 'RESIST'
  | 'FAIL';

export const DUMP_PATH_SCENARIO_KO: Record<DumpPathScenario, string> = {
  WATCH: '감시',
  BOUNCE: '반등진행',
  RESIST: '저항반응',
  FAIL: '실패(무효)',
};

export type DumpSupportResistPath = {
  support: DumpBandSnap | null;
  resist: DumpBandSnap | null;
  bounceCap: DumpBounceCap | null;
  supportPrice: number | null;
  bounceLimitPrice: number | null;
  resistPrice: number | null;
  supportFirm: boolean;
  resistFirm: boolean;
  /** 지지 하단 종가 이탈 = 경로 무효 */
  invalidationPrice: number | null;
  scenario: DumpPathScenario;
  scenarioKo: string;
  pathKo: string;
  tipKo: string;
};

function tfRank(tf: string): number {
  return timeframeRank(normalizeChartTimeframe(tf));
}

function floorScore(z: DumpBandSnap, price: number): number {
  const mid = Number(z.mid);
  if (!(mid > 0) || !(price > 0)) return -1;
  let s = Number(z.evidenceScore) || 0;
  if (z.lifeState === 'CONFIRM_UP') s += 100;
  else if (z.lifeState === 'BOUNCE_WATCH') s += 40;
  else if (z.lifeState === 'WATCH') s += 10;
  else if (z.lifeState === 'CONFIRM_DOWN') s -= 20;
  if (mid < price * 1.002) s += 25;
  const dist = Math.abs(price - mid) / price;
  s += Math.max(0, 20 - dist * 800);
  s += tfRank(z.sourceTf) * 0.5;
  return s;
}

function ceilingScore(z: DumpBandSnap, price: number, bounceCapTf?: string): number {
  const mid = Number(z.mid);
  const bot = Math.min(Number(z.bot), Number(z.top));
  const target = bot > 0 ? bot : mid;
  if (!(target > 0) || !(price > 0)) return -1;
  let s = Number(z.evidenceScore) || 0;
  if (z.lifeState === 'CONFIRM_RESIST') s += 100;
  else if (z.lifeState === 'RESIST_WATCH') s += 40;
  else if (z.lifeState === 'WATCH') s += 10;
  if (bounceCapTf && normalizeChartTimeframe(z.sourceTf) === bounceCapTf) s += 35;
  if (target > price * 1.002) s += 25;
  const dist = Math.abs(target - price) / price;
  s += Math.max(0, 18 - dist * 700);
  s += tfRank(z.sourceTf) * 0.5;
  return s;
}

function resolveScenario(params: {
  price: number;
  hi: number;
  lo: number;
  close: number;
  support: DumpBandSnap | null;
  supportPrice: number | null;
  invalidationPrice: number | null;
  bounceLimit: number | null;
  resistPrice: number | null;
  supportFirm: boolean;
  resistFirm: boolean;
}): DumpPathScenario {
  const inv = params.invalidationPrice;
  const mid = params.supportPrice;
  const bounce = params.bounceLimit;
  const resist = params.resistPrice ?? bounce;

  /** 지지 하단 종가 이탈 → 경로 실패 */
  if (inv != null && inv > 0 && params.close < inv * 0.9995) {
    return 'FAIL';
  }
  if (params.support?.lifeState === 'CONFIRM_DOWN') {
    return 'FAIL';
  }

  /** 저항/반등한도 터치·거절 */
  if (resist != null && resist > 0) {
    const nearR = params.hi >= resist * 0.998;
    if (
      nearR &&
      (params.resistFirm ||
        params.support?.lifeState === 'RESIST_WATCH' ||
        params.close < resist)
    ) {
      if (params.resistFirm || (nearR && params.close < resist * 0.999)) {
        return 'RESIST';
      }
    }
  }

  /** 지지 위 + 반등한도 전 = 반등진행 */
  if (mid != null && mid > 0 && params.close > mid * 0.999) {
    if (bounce == null || params.close < bounce * 1.002) {
      if (
        params.supportFirm ||
        params.support?.lifeState === 'BOUNCE_WATCH' ||
        params.support?.lifeState === 'CONFIRM_UP' ||
        (params.lo <= mid * 1.004 && params.close > mid)
      ) {
        return 'BOUNCE';
      }
    }
  }

  if (params.supportFirm || params.resistFirm) return 'BOUNCE';
  return 'WATCH';
}

/**
 * 폭락 floor/ceiling + 반등1차 → 지지·반등구간·저항 경로 + 무효·시나리오.
 */
export function buildDumpSupportResistPath(params: {
  zones: DumpBandSnap[];
  bounceCap: DumpBounceCap | null;
  priceNow: number;
  chartCandles?: Candle[] | null;
}): DumpSupportResistPath {
  const price = Number(params.priceNow);
  const bounceCap = params.bounceCap;
  const candles = params.chartCandles ?? [];
  const last = candles.length > 0 ? candles[candles.length - 1]! : null;
  const close = last ? Number(last.close) : price;
  const hi = last ? Number(last.high) : price;
  const lo = last ? Number(last.low) : price;

  const empty: DumpSupportResistPath = {
    support: null,
    resist: null,
    bounceCap,
    supportPrice: null,
    bounceLimitPrice: bounceCap?.price ?? null,
    resistPrice: null,
    supportFirm: false,
    resistFirm: false,
    invalidationPrice: null,
    scenario: 'WATCH',
    scenarioKo: DUMP_PATH_SCENARIO_KO.WATCH,
    pathKo: '',
    tipKo: '',
  };
  if (!(price > 0)) return empty;

  const floors = (params.zones ?? []).filter((z) => (z.bandRole ?? 'floor') === 'floor');
  const ceilings = (params.zones ?? []).filter((z) => z.bandRole === 'ceiling');

  let support: DumpBandSnap | null = null;
  let bestF = -1;
  for (const z of floors) {
    const sc = floorScore(z, price);
    if (sc > bestF) {
      bestF = sc;
      support = z;
    }
  }

  let resist: DumpBandSnap | null = null;
  let bestC = -1;
  const capTf = bounceCap?.sourceTf;
  for (const z of ceilings) {
    const sc = ceilingScore(z, price, capTf);
    if (sc > bestC) {
      bestC = sc;
      resist = z;
    }
  }

  const supportFirm = support?.lifeState === 'CONFIRM_UP';
  const resistFirm = resist?.lifeState === 'CONFIRM_RESIST';
  const supportPrice =
    support && Number(support.mid) > 0 ? Number(support.mid) : null;
  const supportBot =
    support != null
      ? Math.min(Number(support.bot) || Infinity, Number(support.mid) || Infinity)
      : null;
  const invalidationPrice =
    supportBot != null && Number.isFinite(supportBot) && supportBot > 0
      ? supportBot
      : supportPrice != null
        ? supportPrice * 0.9985
        : null;

  const resistPrice = resist
    ? (() => {
        const bot = Math.min(Number(resist.bot), Number(resist.top));
        const mid = Number(resist.mid);
        return bot > 0 ? bot : mid > 0 ? mid : null;
      })()
    : bounceCap?.price ?? null;
  const bounceLimit = bounceCap?.price ?? null;

  const scenario = resolveScenario({
    price,
    hi,
    lo,
    close,
    support,
    supportPrice,
    invalidationPrice,
    bounceLimit,
    resistPrice,
    supportFirm,
    resistFirm,
  });
  const scenarioKo = DUMP_PATH_SCENARIO_KO[scenario];

  const bits: string[] = [];
  if (supportPrice != null) {
    bits.push(
      `${supportFirm ? '확실지지' : '지지후보'} ${Math.round(supportPrice)}${
        support?.sourceTfKo ? `(${support.sourceTfKo})` : ''
      }`
    );
  }
  if (bounceLimit != null && bounceLimit > 0) {
    bits.push(`반등가능 ${Math.round(bounceLimit)}`);
  }
  if (resistPrice != null && resistPrice > 0 && resistPrice !== bounceLimit) {
    bits.push(
      `${resistFirm ? '확실저항' : '저항후보'} ${Math.round(resistPrice)}${
        resist?.sourceTfKo ? `(${resist.sourceTfKo})` : ''
      }`
    );
  } else if (resistFirm && resistPrice != null) {
    bits.push(`확실저항 ${Math.round(resistPrice)}`);
  }

  const pathCore = bits.length >= 2 ? bits.join(' → ') : bits[0] ?? '';
  const pathKo = pathCore ? `${scenarioKo} · ${pathCore}` : scenarioKo;
  const invBit =
    invalidationPrice != null
      ? ` · 무효 ${Math.round(invalidationPrice)} 종가↓`
      : '';
  const tipKo = pathCore
    ? `${pathKo}${invBit} · 폭락존 경로 1세트 · 한도·목표가 보장 아님`
    : `반등 시나리오 ${scenarioKo} · 지지·반등한도 대기`;

  return {
    support,
    resist,
    bounceCap,
    supportPrice,
    bounceLimitPrice: bounceLimit,
    resistPrice,
    supportFirm,
    resistFirm,
    invalidationPrice,
    scenario,
    scenarioKo,
    pathKo,
    tipKo,
  };
}

export function dumpFirmRoleKo(
  bandRole: 'floor' | 'ceiling' | undefined,
  life: DumpLifeState | undefined
): string | null {
  if (bandRole === 'ceiling' && life === 'CONFIRM_RESIST') return '확실저항';
  if ((bandRole ?? 'floor') === 'floor' && life === 'CONFIRM_UP') return '확실지지';
  return null;
}
