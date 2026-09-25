/**
 * 폭락구간 라이프사이클 — 노랑(감시) → 증거 합류 → 초록/주황(확정).
 * P0: 매수/매도 거래량·쇼크·빔·Hot·구조·SMC OB 합류 없으면 확정 억제.
 * 하단: 반등감시·반등확정 / 상단: 저항감시·저항확정.
 * 기존 라벨(1시간 폭락 등) 유지. 확정 승률·수익 보장 아님.
 */
import type { Candle } from '@/types';
import { normalizeChartTimeframe } from '@/lib/constants';
import {
  buildDumpConfluenceSnap,
  dumpBearConfluenceOk,
  dumpBullConfluenceOk,
  type DumpConfluenceSnap,
} from '@/lib/mergedDeskDumpConfluence';

export type DumpLifeState =
  | 'WATCH'
  | 'CONFIRM_DOWN'
  | 'BOUNCE_WATCH'
  | 'CONFIRM_UP'
  | 'RESIST_WATCH'
  | 'CONFIRM_RESIST';

export const DUMP_LIFE_KO: Record<DumpLifeState, string> = {
  WATCH: '대기',
  CONFIRM_DOWN: '하락확정',
  BOUNCE_WATCH: '반등감시',
  CONFIRM_UP: '상승확정',
  RESIST_WATCH: '저항감시',
  CONFIRM_RESIST: '저항확정',
};

/**
 * 라벨 방향 맞춤 (분·시간·일·주·월 각 TF 세트 공통):
 * - 반등 맥락: 하단=반등지지 · 상단=폭등감시
 * - 폭락 맥락: 하단=폭락 · 상단=폭락감시
 */
export function dumpBandBounceContext(params: {
  scenarioKo?: string | null;
  life?: DumpLifeState | null;
  role: 'floor' | 'ceiling';
  isBounceCap?: boolean;
  sameTfFloorLife?: DumpLifeState | null;
  /** 해당 TF 지지~상단 사이(또는 지지 터치) */
  inBounceZone?: boolean;
  touchedSupport?: boolean;
  /** 현재가 < 해당 TF 상단 → 위로 향하는 한도 = 폭등감시 */
  priceBelowCeiling?: boolean;
}): boolean {
  const floorLife = params.role === 'floor' ? params.life : params.sameTfFloorLife;
  /** 나락확정이면 그 TF 세트는 폭락 라벨 유지 */
  if (floorLife === 'CONFIRM_DOWN' || params.life === 'CONFIRM_DOWN') return false;

  const sc = String(params.scenarioKo || '');
  if (sc === '반등진행') return true;
  if (params.isBounceCap) return true;
  if (params.inBounceZone || params.touchedSupport) return true;
  if (floorLife === 'BOUNCE_WATCH' || floorLife === 'CONFIRM_UP') return true;
  if (params.role === 'ceiling') {
    if (params.life === 'BOUNCE_WATCH' || params.life === 'CONFIRM_UP') return true;
    if (params.priceBelowCeiling) return true;
    if (sc === '저항반응' && (params.life === 'RESIST_WATCH' || params.life === 'CONFIRM_RESIST')) {
      return true;
    }
  }
  /** floor: 상단이 위에 있고 폭락확정 아니면 반등지지 후보 */
  if (params.role === 'floor' && params.priceBelowCeiling) return true;
  return false;
}

/** Bu/Be처럼 면 방향 — 반등맥락=롱 · 폭락맥락=숏 */
export function dumpBandBiasSide(params: {
  role: 'floor' | 'ceiling';
  bounceContext: boolean;
  life?: DumpLifeState | null;
  /** 종가가 상단(ceiling) 위 — 숏 폭등감시 유지 금지 */
  priceAboveCeiling?: boolean;
}): 'LONG' | 'SHORT' {
  if (params.priceAboveCeiling && params.role === 'ceiling') return 'LONG';
  if (params.life === 'CONFIRM_DOWN') return 'SHORT';
  if (params.life === 'CONFIRM_UP') return 'LONG';
  return params.bounceContext ? 'LONG' : 'SHORT';
}

export function dumpBandFaceRoleKo(params: {
  role: 'floor' | 'ceiling';
  bounceContext: boolean;
  schematic?: boolean;
  life?: DumpLifeState | null;
  priceAboveCeiling?: boolean;
}): string {
  if (params.role === 'ceiling' && params.priceAboveCeiling) return '상단돌파';
  if (params.role === 'floor' && params.life === 'CONFIRM_DOWN') return '하락확정';
  if (params.role === 'floor' && params.life === 'CONFIRM_UP') return '상승확정';
  if (params.role === 'ceiling' && params.life === 'CONFIRM_RESIST') return '저항확정';
  if (params.role === 'ceiling') {
    return params.bounceContext ? '폭등감시' : '폭락감시';
  }
  if (params.bounceContext) {
    return params.schematic ? '반등구간' : '반등지지';
  }
  return params.schematic ? '폭락구간' : '폭락';
}

export function dumpBandFaceLabelKo(params: {
  tfKo: string;
  role: 'floor' | 'ceiling';
  bounceContext: boolean;
  schematic?: boolean;
  schematicShort?: boolean;
  life?: DumpLifeState | null;
  /** 종가 > ceiling — 「숏 폭등감시」 고착 방지 */
  priceAboveCeiling?: boolean;
}): string {
  if (params.priceAboveCeiling && params.role === 'ceiling') {
    if (params.schematicShort) return '상단돌파';
    return `${params.tfKo} 상단돌파`;
  }
  const bias = dumpBandBiasSide({
    role: params.role,
    bounceContext: params.bounceContext,
    life: params.life,
    priceAboveCeiling: params.priceAboveCeiling,
  });
  const biasKo = bias === 'LONG' ? '롱' : '숏';
  const roleKo = dumpBandFaceRoleKo({
    role: params.role,
    bounceContext: params.bounceContext,
    schematic: params.schematic,
    life: params.life,
    priceAboveCeiling: params.priceAboveCeiling,
  });
  if (params.schematicShort) return `${biasKo} ${roleKo}`;
  return `${biasKo} ${params.tfKo} ${roleKo}`;
}

const DUMP_ALIGN_HTF = new Set(['1h', '4h', '1d', '1w', '1M']);

export type DumpMtfAlign = {
  side: 'SHORT' | 'LONG' | 'MIXED';
  linked: boolean;
  confirmLinked: boolean;
  /** 차트 면 · 확정은 CONFIRM 증거가 있을 때만 */
  tagKo: string | null;
  extraClass: string;
};

/** MTF 폭락 박스를 Bu-BB/MB처럼 한 방향으로 묶을지 */
export function evaluateDumpMtfAlign(params: {
  zones: Array<{
    sourceTf: string;
    bandRole?: 'floor' | 'ceiling';
    lifeState?: DumpLifeState | null;
    viewActive?: boolean;
  }>;
  bounceCtxByTf: Map<string, boolean>;
}): DumpMtfAlign {
  const floors = params.zones.filter(
    (z) => (z.bandRole ?? 'floor') === 'floor' && z.viewActive !== false
  );
  const empty: DumpMtfAlign = {
    side: 'MIXED',
    linked: false,
    confirmLinked: false,
    tagKo: null,
    extraClass: '',
  };
  if (floors.length < 2) return empty;

  const sides = floors.map((z) =>
    dumpBandBiasSide({
      role: 'floor',
      bounceContext: params.bounceCtxByTf.get(normalizeChartTimeframe(z.sourceTf)) === true,
      life: z.lifeState,
    })
  );
  const allShort = sides.every((s) => s === 'SHORT');
  const allLong = sides.every((s) => s === 'LONG');
  if (!allShort && !allLong) return empty;

  const anyConfirmDown = floors.some((z) => z.lifeState === 'CONFIRM_DOWN');
  const anyConfirmUp = floors.some((z) => z.lifeState === 'CONFIRM_UP');
  const htfShort = floors.some(
    (z) =>
      DUMP_ALIGN_HTF.has(normalizeChartTimeframe(z.sourceTf)) &&
      dumpBandBiasSide({
        role: 'floor',
        bounceContext: params.bounceCtxByTf.get(normalizeChartTimeframe(z.sourceTf)) === true,
        life: z.lifeState,
      }) === 'SHORT'
  );
  const htfLong = floors.some(
    (z) =>
      DUMP_ALIGN_HTF.has(normalizeChartTimeframe(z.sourceTf)) &&
      dumpBandBiasSide({
        role: 'floor',
        bounceContext: params.bounceCtxByTf.get(normalizeChartTimeframe(z.sourceTf)) === true,
        life: z.lifeState,
      }) === 'LONG'
  );

  if (allShort) {
    const confirmLinked = anyConfirmDown || htfShort;
    return {
      side: 'SHORT',
      linked: true,
      confirmLinked,
      tagKo: confirmLinked ? '하락확정연동' : '하락연동',
      extraClass: confirmLinked
        ? 'merged-desk-mtf-dump-align-short merged-desk-mtf-dump-align-confirm'
        : 'merged-desk-mtf-dump-align-short',
    };
  }

  const confirmLinked = anyConfirmUp || htfLong;
  return {
    side: 'LONG',
    linked: true,
    confirmLinked,
    tagKo: confirmLinked ? '상승확정연동' : '상승연동',
    extraClass: confirmLinked
      ? 'merged-desk-mtf-dump-align-long merged-desk-mtf-dump-align-confirm'
      : 'merged-desk-mtf-dump-align-long',
  };
}

export type DumpLifeResult = {
  state: DumpLifeState;
  score: number;
  reasonsKo: string[];
  confluence?: DumpConfluenceSnap;
};

function atrApprox(candles: Candle[]): number {
  const n = candles.length;
  if (n < 8) return Math.abs(Number(candles[n - 1]?.close) || 1) * 0.006;
  let s = 0;
  let c = 0;
  for (let i = Math.max(1, n - 14); i < n; i++) {
    const a = candles[i]!;
    const b = candles[i - 1]!;
    const tr = Math.max(
      Number(a.high) - Number(a.low),
      Math.abs(Number(a.high) - Number(b.close)),
      Math.abs(Number(a.low) - Number(b.close))
    );
    if (Number.isFinite(tr)) {
      s += tr;
      c += 1;
    }
  }
  return c > 0 ? s / c : Math.abs(Number(candles[n - 1]?.close) || 1) * 0.006;
}

/**
 * 차트 캔들 기준 — 폭락존 터치·종가 + P0 거래량 합류로 상태 판정.
 * 확정(나락/반등/저항): 가격 증거 score≥3 AND 방향 맞는 거래량 합류.
 * 합류 없으면 감시만 (가짜 확정 억제).
 */
export function evaluateDumpLifeCycle(params: {
  chartCandles: Candle[];
  top: number;
  bot: number;
  mid: number;
  bandRole?: 'floor' | 'ceiling';
  confluence?: DumpConfluenceSnap | null;
  hotZones?: import('@/lib/mergedDeskHotZoneEntry').MergedDeskHotZoneEntry[] | null;
  whaleBeamIntel?: import('@/lib/whaleVolumeBeamIntel').WhaleBeamIntelPack | null;
}): DumpLifeResult {
  const candles = params.chartCandles ?? [];
  const n = candles.length;
  const reasons: string[] = [];
  if (n < 8 || !(params.mid > 0)) {
    return { state: 'WATCH', score: 0, reasonsKo: ['데이터부족'] };
  }

  const atr = atrApprox(candles);
  const last = candles[n - 1]!;
  const prev = candles[n - 2]!;
  const price = Number(last.close);
  const hi = Number(last.high);
  const lo = Number(last.low);
  const top = Math.max(params.top, params.bot);
  const bot = Math.min(params.top, params.bot);
  const mid = params.mid;
  const pad = Math.max(atr * 0.15, mid * 0.0008);
  const prevClose = Number(prev.close);
  const prev2Close = Number(candles[n - 3]?.close);
  const isCeiling = params.bandRole === 'ceiling';

  const confluence =
    params.confluence ??
    buildDumpConfluenceSnap({
      chartCandles: candles,
      zoneTop: top,
      zoneBot: bot,
      hotZones: params.hotZones,
      whaleBeamIntel: params.whaleBeamIntel,
    });

  const touchZone = lo <= top + pad && hi >= bot - pad;
  const closeBelow = price < bot - pad * 0.25;
  const closeAbove = price > top + pad * 0.25;
  const closeInside = price >= bot && price <= top;
  const wickThroughBot = lo < bot - pad * 0.1 && price > mid;
  const prevBelow = prevClose < bot;
  const reclaim = prevBelow && price > mid;

  const wickRejectTop =
    hi >= top - pad * 0.35 && price <= mid + pad * 0.75 && price < hi - pad * 0.2;
  const failBreakout = prevClose > top + pad * 0.1 && price <= top + pad * 0.35;
  const approachFromBelow =
    prevClose <= mid + pad && hi >= mid - pad && price >= bot - pad;
  const risingIntoUpper =
    price > prevClose &&
    touchZone &&
    (hi >= mid || price >= mid) &&
    lo < top + pad;
  const bearishReject =
    price < prevClose && touchZone && hi >= mid && (closeInside || price < mid);

  let score = 0;
  if (touchZone) {
    score += 1;
    reasons.push('존터치');
  }
  if (closeBelow) {
    score += 2;
    reasons.push('종가이탈↓');
  }
  if (wickThroughBot && !closeBelow) {
    score += 1;
    reasons.push('하단윅');
  }
  if (reclaim) {
    score += 2;
    reasons.push('존회복');
  }
  if (wickRejectTop) {
    score += 2;
    reasons.push('상단윅저항');
  }
  if (failBreakout) {
    score += 2;
    reasons.push('돌파실패');
  }
  if (bearishReject) {
    score += 1;
    reasons.push('상단거절');
  }
  if (price < prevClose && prevClose < prev2Close) {
    score += 1;
    reasons.push('하락연속');
  }
  if (price > prevClose && prevClose > prev2Close && touchZone && lo <= mid + pad) {
    score += 1;
    reasons.push('반등연속');
  }
  if (risingIntoUpper && approachFromBelow) {
    score += 1;
    reasons.push('상단접근↑');
  }

  /** P0 합류 점수·사유 (거래량·빔·Hot·구조·SMC OB) */
  if (confluence.bullScore > 0 || confluence.bearScore > 0) {
    score += Math.min(3, Math.max(confluence.bullScore, confluence.bearScore) >= 2 ? 2 : 1);
  }
  if (confluence.bullObConfirm || confluence.bearObConfirm) {
    score += 1;
  }
  for (const r of confluence.reasonsKo.slice(0, 4)) {
    if (!reasons.includes(r)) reasons.push(r);
  }

  const bullOk = dumpBullConfluenceOk(confluence);
  const bearOk = dumpBearConfluenceOk(confluence);

  const resistEvidence =
    wickRejectTop || failBreakout || bearishReject || confluence.structureRejectUp;
  const resistWatch =
    !closeBelow &&
    (resistEvidence ||
      (approachFromBelow && risingIntoUpper) ||
      (touchZone && hi >= top - pad * 0.8 && price <= top + pad && !reclaim) ||
      (isCeiling && touchZone));

  const bounceWatch =
    !closeBelow &&
    !isCeiling &&
    (wickThroughBot ||
      reclaim ||
      (closeAbove && price > mid) ||
      (touchZone && price > mid && lo <= bot + pad * 1.2 && !resistEvidence));

  let state: DumpLifeState = 'WATCH';

  /** 확정은 가격 증거 + 방향 거래량 합류 필수 */
  if (closeBelow && score >= 3 && bearOk) {
    /** ceiling(폭락감시)은 나락확정 라벨 금지 — 하방통과면 감시, 거절이면 저항확정 */
    state = isCeiling ? 'WATCH' : 'CONFIRM_DOWN';
    if (isCeiling && !reasons.includes('저항하방통과')) reasons.push('저항하방통과');
  } else if (resistEvidence && score >= 3 && bearOk && !reclaim && (isCeiling || risingIntoUpper)) {
    state = 'CONFIRM_RESIST';
  } else if ((reclaim || (wickThroughBot && closeAbove)) && score >= 3 && bullOk && !isCeiling) {
    state = 'CONFIRM_UP';
  } else if (closeBelow && score >= 3 && !bearOk) {
    state = isCeiling ? 'RESIST_WATCH' : 'WATCH';
    if (!reasons.includes('매도량부족')) reasons.push('매도량부족');
  } else if (resistEvidence && score >= 3 && !bearOk) {
    state = isCeiling || risingIntoUpper ? 'RESIST_WATCH' : 'WATCH';
    if (!reasons.includes('매도량부족')) reasons.push('매도량부족');
  } else if ((reclaim || (wickThroughBot && closeAbove)) && score >= 3 && !bullOk) {
    state = 'BOUNCE_WATCH';
    if (!reasons.includes('매수량부족')) reasons.push('매수량부족');
  } else if (resistWatch && !bounceWatch) {
    state = 'RESIST_WATCH';
  } else if (resistWatch && bounceWatch) {
    state = resistEvidence || risingIntoUpper || isCeiling ? 'RESIST_WATCH' : 'BOUNCE_WATCH';
  } else if (bounceWatch || (!isCeiling && (closeAbove || (price > mid && touchZone)))) {
    state = 'BOUNCE_WATCH';
  } else if (closeInside || touchZone || price > bot) {
    state = isCeiling && touchZone ? 'RESIST_WATCH' : 'WATCH';
  } else if (price < bot) {
    if (isCeiling) {
      state = 'WATCH';
    } else {
      state = score >= 2 && bearOk ? 'CONFIRM_DOWN' : 'WATCH';
    }
  }

  return {
    state,
    score,
    reasonsKo: reasons.slice(0, 6),
    confluence,
  };
}

/** 대기/감시=노랑 · 하락확정=빨강 · 상승확정=초록 · 저항=주황
 *  라벨은 존 배경에 묻히지 않게 밝은 상태색 + 검정 윤곽(테두리네모 없음) */
export function dumpLifeVisual(state: DumpLifeState): {
  fill: string;
  border: string;
  labelBg: string;
  labelFg: string;
  line: string;
  lifeClass: string;
} {
  if (state === 'CONFIRM_DOWN') {
    return {
      fill: 'rgba(239,68,68,0.14)',
      border: 'rgba(248,113,113,0.85)',
      labelBg: 'transparent',
      labelFg: '#fecaca',
      line: '#f87171',
      lifeClass: 'merged-desk-mtf-dump-confirm-down',
    };
  }
  if (state === 'CONFIRM_RESIST') {
    return {
      fill: 'rgba(249,115,22,0.14)',
      border: 'rgba(251,146,60,0.85)',
      labelBg: 'transparent',
      labelFg: '#ffedd5',
      line: '#fb923c',
      lifeClass: 'merged-desk-mtf-dump-resist',
    };
  }
  if (state === 'RESIST_WATCH') {
    return {
      fill: 'rgba(234,179,8,0.14)',
      border: 'rgba(202,138,4,0.85)',
      labelBg: 'transparent',
      labelFg: '#fef9c3',
      line: '#eab308',
      lifeClass: 'merged-desk-mtf-dump-resist-watch',
    };
  }
  if (state === 'CONFIRM_UP') {
    return {
      fill: 'rgba(34,197,94,0.14)',
      border: 'rgba(74,222,128,0.85)',
      labelBg: 'transparent',
      labelFg: '#bbf7d0',
      line: '#4ade80',
      lifeClass: 'merged-desk-mtf-dump-confirm-up',
    };
  }
  if (state === 'BOUNCE_WATCH') {
    /** 반등감시 = 대기 계열 → 노랑 */
    return {
      fill: 'rgba(234,179,8,0.14)',
      border: 'rgba(202,138,4,0.85)',
      labelBg: 'transparent',
      labelFg: '#fef9c3',
      line: '#eab308',
      lifeClass: 'merged-desk-mtf-dump-bounce-watch',
    };
  }
  /** 대기 — 노랑 */
  return {
    fill: 'rgba(234,179,8,0.14)',
    border: 'rgba(202,138,4,0.85)',
    labelBg: 'transparent',
    labelFg: '#fef9c3',
    line: '#ca8a04',
    lifeClass: 'merged-desk-mtf-dump-watch',
  };
}

/**
 * TF 세트(지지·반등구간·한도·확률) 동일 색상.
 * 라이프사이클은 투명도/굵기로만 구분 — hue는 TF 고정.
 */
export type DumpTfSetVisual = {
  fill: string;
  fillSoft: string;
  fillBounce: string;
  border: string;
  line: string;
  labelBg: string;
  labelFg: string;
  setClass: string;
};

export function dumpTfSetVisual(tf: string): DumpTfSetVisual {
  /** normalize 유지(1M≠1m) */
  const t = normalizeChartTimeframe(String(tf || '').trim() || '15m');
  if (t === '1M') {
    return {
      fill: 'rgba(244,114,182,0.14)',
      fillSoft: 'rgba(244,114,182,0.1)',
      fillBounce: 'rgba(244,114,182,0.14)',
      border: 'rgba(244,114,182,0.9)',
      line: '#f472b6',
      labelBg: 'rgba(131,24,67,0.95)',
      labelFg: '#fbcfe8',
      setClass: 'merged-desk-mtf-dump-set-1M',
    };
  }
  if (t === '15m' || t === '3m') {
    return {
      fill: 'rgba(45,212,191,0.14)',
      fillSoft: 'rgba(45,212,191,0.1)',
      fillBounce: 'rgba(45,212,191,0.14)',
      border: 'rgba(45,212,191,0.88)',
      line: '#2dd4bf',
      labelBg: 'rgba(19,78,74,0.95)',
      labelFg: '#99f6e4',
      setClass: 'merged-desk-mtf-dump-set-15m',
    };
  }
  if (t === '5m') {
    return {
      fill: 'rgba(52,211,153,0.14)',
      fillSoft: 'rgba(52,211,153,0.1)',
      fillBounce: 'rgba(52,211,153,0.14)',
      border: 'rgba(52,211,153,0.9)',
      line: '#34d399',
      labelBg: 'rgba(6,78,59,0.95)',
      labelFg: '#a7f3d0',
      setClass: 'merged-desk-mtf-dump-set-5m',
    };
  }
  if (t === '1m') {
    return {
      fill: 'rgba(34,211,238,0.14)',
      fillSoft: 'rgba(34,211,238,0.09)',
      fillBounce: 'rgba(34,211,238,0.14)',
      border: 'rgba(34,211,238,0.85)',
      line: '#22d3ee',
      labelBg: 'rgba(8,51,68,0.95)',
      labelFg: '#a5f3fc',
      setClass: 'merged-desk-mtf-dump-set-1m',
    };
  }
  if (t === '1h' || t === '30m') {
    return {
      fill: 'rgba(74,222,128,0.14)',
      fillSoft: 'rgba(74,222,128,0.1)',
      fillBounce: 'rgba(74,222,128,0.14)',
      border: 'rgba(74,222,128,0.9)',
      line: '#4ade80',
      labelBg: 'rgba(20,83,45,0.95)',
      labelFg: '#bbf7d0',
      setClass: 'merged-desk-mtf-dump-set-1h',
    };
  }
  if (t === '4h' || t === '2h') {
    return {
      fill: 'rgba(96,165,250,0.14)',
      fillSoft: 'rgba(96,165,250,0.1)',
      fillBounce: 'rgba(96,165,250,0.14)',
      border: 'rgba(96,165,250,0.9)',
      line: '#60a5fa',
      labelBg: 'rgba(30,58,138,0.95)',
      labelFg: '#bfdbfe',
      setClass: 'merged-desk-mtf-dump-set-4h',
    };
  }
  if (t === '1d' || t === '12h' || t === '8h' || t === '6h') {
    return {
      fill: 'rgba(167,139,250,0.14)',
      fillSoft: 'rgba(167,139,250,0.1)',
      fillBounce: 'rgba(167,139,250,0.14)',
      border: 'rgba(167,139,250,0.9)',
      line: '#a78bfa',
      labelBg: 'rgba(76,29,149,0.95)',
      labelFg: '#ddd6fe',
      setClass: 'merged-desk-mtf-dump-set-1d',
    };
  }
  if (t === '1w') {
    return {
      fill: 'rgba(251,146,60,0.14)',
      fillSoft: 'rgba(251,146,60,0.1)',
      fillBounce: 'rgba(251,146,60,0.14)',
      border: 'rgba(251,146,60,0.9)',
      line: '#fb923c',
      labelBg: 'rgba(124,45,18,0.95)',
      labelFg: '#fed7aa',
      setClass: 'merged-desk-mtf-dump-set-1w',
    };
  }
  return {
    fill: 'rgba(148,163,184,0.14)',
    fillSoft: 'rgba(148,163,184,0.1)',
    fillBounce: 'rgba(148,163,184,0.14)',
    border: 'rgba(148,163,184,0.85)',
    line: '#94a3b8',
    labelBg: 'rgba(51,65,85,0.95)',
    labelFg: '#e2e8f0',
    setClass: 'merged-desk-mtf-dump-set-other',
  };
}

/**
 * zone/라벨 색 = 상태(대기노랑·하락빨강·상승초록).
 * TF 세트는 setClass·dim만 유지.
 */
export function dumpTfSetRoleVisual(params: {
  tf: string;
  life?: DumpLifeState;
  role: 'floor' | 'ceiling' | 'bounce1';
  /** 현재 반등 활성 세트 */
  active?: boolean;
  /** 다른 TF 흐리게 */
  dim?: boolean;
}): {
  fill: string;
  border: string;
  line: string;
  labelBg: string;
  labelFg: string;
  lifeClass: string;
  setClass: string;
} {
  const set = dumpTfSetVisual(params.tf);
  const life = params.life ?? 'WATCH';
  const lifeVis = dumpLifeVisual(life);
  let fill = lifeVis.fill;
  if (params.role === 'bounce1' && (life === 'WATCH' || life === 'BOUNCE_WATCH')) {
    fill = lifeVis.fill.replace(/[\d.]+\)$/, '0.14)');
  }
  if (params.role === 'ceiling' && life === 'WATCH') {
    fill = lifeVis.fill.replace(/[\d.]+\)$/, '0.14)');
  }
  let border = lifeVis.border;
  if (params.dim) {
    fill = fill.replace(/[\d.]+\)$/, '0.08)');
    border = border.replace(/[\d.]+\)$/, '0.35)');
  } else if (!params.active && params.role === 'bounce1') {
    fill = fill.replace(/[\d.]+\)$/, '0.12)');
  }
  return {
    fill,
    border,
    line: lifeVis.line,
    labelBg: lifeVis.labelBg,
    labelFg: lifeVis.labelFg,
    lifeClass: lifeVis.lifeClass,
    setClass: set.setClass,
  };
}

/** 반등1차 zone — TF 세트색 유지 */
export function dumpBounce1ZoneVisual(floorLife: DumpLifeState | undefined, active: boolean) {
  const life =
    floorLife === 'CONFIRM_UP' || floorLife === 'BOUNCE_WATCH'
      ? floorLife
      : active
        ? 'BOUNCE_WATCH'
        : 'BOUNCE_WATCH';
  const vis = dumpLifeVisual(life);
  if (!active) {
    return {
      ...vis,
      fill: vis.fill.replace(/[\d.]+\)$/, '0.12)'),
    };
  }
  return vis;
}

export function formatZoneFacePrice(params: {
  nameKo: string;
  mid: number;
  priceOnly?: boolean;
  signalKo?: string;
}): { face: string; signal: string; tip: string } {
  const midN = Number(params.mid);
  const px = Number.isFinite(midN) && midN > 0 ? Math.round(midN) : 0;
  const pxStr = px > 0 ? String(px) : '';
  const sig = String(params.signalKo || '').trim();
  if (params.priceOnly && pxStr) {
    return {
      face: pxStr,
      signal: [params.nameKo, sig].filter(Boolean).join('·') || params.nameKo,
      tip: `${params.nameKo} ${pxStr}${sig ? ` · ${sig}` : ''}`,
    };
  }
  const face = pxStr ? `${params.nameKo} ${pxStr}` : params.nameKo;
  return {
    face,
    signal: sig || '',
    tip: `${params.nameKo}${pxStr ? ` ${pxStr}` : ''}${sig ? ` · ${sig}` : ''}`,
  };
}
