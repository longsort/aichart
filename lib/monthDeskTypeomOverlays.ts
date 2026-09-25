/**
 * 마감·안착 전용: 구조 돌파 레그 + 골든포켓(38.2~61.8%) **타점 존**·좁은 **코어**,
 * 3캔들 **FVG**가 존과 겹칠 때 보조 존, 마감존×구조 **HUD 정합 문구**·종가 위치를 툴팁에 합성,
 * ST 밴드 과폭 시 스냅 가중 완화, 무효·TP1~3. 교육·참고용(확정 신호·손익 보장 아님).
 * 롱 진입=초록 / 숏 진입=빨강 / 대기(불안·중립)=노랑 — 진입(E)·손절(SL)·수익(TP) 가로선 색 통일.
 * 차트는 `id` 프리픽스 `month-desk-typeom-`에 대해 `zoneDirectionalColors` 롱/숏 틴트를 적용하지 않음(면색 유지).
 */
import type { Candle, OverlayItem } from '@/types';
import type { ClosingEnvelopeFuturesScenario, InstitutionalSuperTrendCore } from '@/lib/institutionalSuperBand';
import {
  monthDeskZoneIsWait,
  monthDeskZonePalette,
  resolveMonthDeskZoneSignal,
  type MonthDeskConfirmedInput,
  type MonthDeskZoneSignal,
} from '@/lib/monthDeskZoneSignalPalette';
import {
  capZoneVerticalSpan,
  findRecentImpulseLeg,
  htfMaxPocketSpan,
  htfOtePocketBounds,
  isMonthDeskHtfTimeframe,
  monthDeskZoneLookbackBars,
} from '@/lib/monthDeskZonePrecision';
import {
  buildMonthDeskTradeDeskPlanOverlays,
  buildMonthDeskUnifiedZoneOverlays,
  computeMonthDeskUnifiedFusion,
  type MonthDeskAnalysisFusionInput,
} from '@/lib/monthDeskUnifiedTradeDesk';
import {
  buildMonthDeskCoreLongEntryOverlays,
  computeMonthDeskCoreLongEntry,
} from '@/lib/monthDeskCoreLongEntry';
import {
  buildMonthDeskCoreShortEntryOverlays,
  computeMonthDeskCoreShortEntry,
} from '@/lib/monthDeskCoreShortEntry';
import { normalizeChartTimeframe } from '@/lib/constants';
import { rangeFromPivots, structureMarksFu } from '@/lib/smcDeskOverlay';

export function atr14(candles: Candle[]): number {
  const n = candles.length;
  if (n < 15) return 0;
  let sum = 0;
  for (let i = n - 14; i < n; i++) {
    const tr = Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - candles[i - 1].close),
      Math.abs(candles[i].low - candles[i - 1].close)
    );
    sum += tr;
  }
  return sum / 14;
}

function fmtPx(n: number): string {
  const a = Math.abs(n);
  const frac = a >= 1000 ? 2 : a >= 1 ? 4 : 6;
  return n.toLocaleString(undefined, { maximumFractionDigits: frac });
}

function legWindowBounds(candles: Candle[], i0: number, i1: number): { pLo: number; pHi: number } | null {
  const lo = Math.max(0, Math.min(i0, i1));
  const hi = Math.max(0, Math.max(i0, i1));
  let pLo = Infinity;
  let pHi = -Infinity;
  for (let i = lo; i <= hi; i++) {
    const c = candles[i];
    if (!c) return null;
    pLo = Math.min(pLo, c.low);
    pHi = Math.max(pHi, c.high);
  }
  if (!Number.isFinite(pLo) || !Number.isFinite(pHi) || pHi <= pLo) return null;
  return { pLo, pHi };
}

/** 골든포켓 상·하단 + 존 시작 시각 */
export function computeTypeomPocket(params: {
  candles: Candle[];
  L: number;
  bias: 'LONG' | 'SHORT' | 'NEUTRAL';
  rng: { swingHigh: number; swingLow: number; tStart: number } | null;
  lastMk: { index: number; bias: 'bullish' | 'bearish'; tag: string } | null;
}): { pocketTop: number; pocketBot: number; legHi: number; legLo: number; tZoneStart: number } | null {
  const { candles, L, bias, rng, lastMk } = params;
  const n = candles.length;
  const end = n - 1;
  const tEnd = Number(candles[end]?.time);
  if (!Number.isFinite(tEnd)) return null;

  if (!rng || rng.swingHigh <= rng.swingLow) return null;
  const rHi = rng.swingHigh;
  const rLo = rng.swingLow;
  const rLeg = rHi - rLo;
  const tRng = Number(rng.tStart);

  if (!lastMk || lastMk.index < 0 || lastMk.index > end) {
    /** 구조 마크 없음: 스윙 레인지 기준 중립 포켓 */
    const pocketBot = rLo + 0.382 * rLeg;
    const pocketTop = rLo + 0.618 * rLeg;
    return { pocketTop, pocketBot, legHi: rHi, legLo: rLo, tZoneStart: Number.isFinite(tRng) ? tRng : Number(candles[Math.max(L, end - 120)]?.time) };
  }

  /** 마지막 마크 봉이 종가봉과 겹치면 레그가 붕괴 → 앞쪽으로 당겨 최소 구간 확보 */
  let iLeg0 = lastMk.index;
  if (end - iLeg0 < 2) {
    iLeg0 = Math.max(L, lastMk.index - 10, end - 16);
  }
  const win = legWindowBounds(candles, iLeg0, end);
  if (!win) return null;
  let legHi = win.pHi;
  let legLo = win.pLo;
  let tZoneStart = Number(candles[iLeg0]?.time);
  if (!Number.isFinite(tZoneStart)) tZoneStart = Number(candles[lastMk.index]?.time);
  if (!Number.isFinite(tZoneStart)) tZoneStart = tRng;

  let pocketTop: number;
  let pocketBot: number;

  if (bias === 'LONG') {
    if (lastMk.bias === 'bullish' && legHi > legLo) {
      const Lg = legHi - legLo;
      pocketTop = legHi - 0.382 * Lg;
      pocketBot = legHi - 0.618 * Lg;
    } else {
      legHi = rHi;
      legLo = rLo;
      pocketTop = rHi - 0.382 * rLeg;
      pocketBot = rHi - 0.618 * rLeg;
      tZoneStart = Number.isFinite(tRng) ? tRng : tZoneStart;
    }
  } else if (bias === 'SHORT') {
    if (lastMk.bias === 'bearish' && legHi > legLo) {
      const Lg = legHi - legLo;
      pocketBot = legLo + 0.382 * Lg;
      pocketTop = legLo + 0.618 * Lg;
    } else {
      legHi = rHi;
      legLo = rLo;
      pocketBot = rLo + 0.382 * rLeg;
      pocketTop = rLo + 0.618 * rLeg;
      tZoneStart = Number.isFinite(tRng) ? tRng : tZoneStart;
    }
  } else {
    legHi = rHi;
    legLo = rLo;
    pocketBot = rLo + 0.382 * rLeg;
    pocketTop = rLo + 0.618 * rLeg;
    tZoneStart = Number.isFinite(tRng) ? tRng : tZoneStart;
  }

  if (!Number.isFinite(pocketTop) || !Number.isFinite(pocketBot)) return null;
  if (pocketTop < pocketBot) {
    const s = pocketTop;
    pocketTop = pocketBot;
    pocketBot = s;
  }
  if (pocketTop <= pocketBot) return null;

  /** 존이 레그 바깥으로 나가지 않게 클램프 */
  pocketTop = Math.min(pocketTop, legHi);
  pocketBot = Math.max(pocketBot, legLo);
  if (pocketTop <= pocketBot) return null;

  return { pocketTop, pocketBot, legHi, legLo, tZoneStart };
}

export function snapPocketToStMid(params: {
  pocketTop: number;
  pocketBot: number;
  legHi: number;
  legLo: number;
  stCore: InstitutionalSuperTrendCore | null;
  endIdx: number;
  /** 밴드 폭이 과도할 때 스냅 가중치 완화 */
  atrHint: number;
}): { pocketTop: number; pocketBot: number } {
  const { pocketTop, pocketBot, legHi, legLo, stCore, endIdx, atrHint } = params;
  let top = pocketTop;
  let bot = pocketBot;
  const mid = (top + bot) / 2;
  const w = top - bot;
  if (w <= 0) return { pocketTop, pocketBot };
  if (!stCore?.finalUpper?.length || !stCore?.finalLower?.length) return { pocketTop: top, pocketBot: bot };
  const nU = stCore.finalUpper.length;
  const ei = Math.max(0, Math.min(endIdx, nU - 1));
  const fu = stCore.finalUpper[ei];
  const fl = stCore.finalLower[ei];
  if (!Number.isFinite(fu) || !Number.isFinite(fl) || fu <= fl) return { pocketTop: top, pocketBot: bot };
  const bmid = (fu + fl) / 2;
  const bw = fu - fl;
  const a = Number.isFinite(atrHint) && atrHint > 0 ? atrHint : bw * 0.25;
  const bandWide = bw > a * 3.8;
  const snapW = bandWide ? 0.2 : 0.42;
  const mid2 = mid * (1 - snapW) + bmid * snapW;
  let nt = Math.min(legHi, mid2 + w / 2);
  let nb = Math.max(legLo, mid2 - w / 2);
  if (nt <= nb) {
    nt = mid2 + w / 2;
    nb = mid2 - w / 2;
  }
  nt = Math.min(nt, legHi);
  nb = Math.max(nb, legLo);
  if (nt <= nb) return { pocketTop, pocketBot };
  return { pocketTop: nt, pocketBot: nb };
}

/** 포켓이 너무 얇으면 ATR·레그 비율 기준으로 최소 폭 확보(가독·참고용). */
export function enforceMinPocketWidth(
  top: number,
  bot: number,
  legHi: number,
  legLo: number,
  atr: number
): { pocketTop: number; pocketBot: number } {
  const leg = Math.max(legHi - legLo, 1e-12);
  let t = top;
  let b = bot;
  let w = t - b;
  const minW = Math.max(leg * 0.0045, atr * 0.052, 1e-12);
  if (w >= minW) return { pocketTop: t, pocketBot: b };
  const mid = (t + b) / 2;
  const half = minW / 2;
  t = Math.min(legHi, mid + half);
  b = Math.max(legLo, mid - half);
  if (t <= b) return { pocketTop: top, pocketBot: bot };
  return { pocketTop: t, pocketBot: b };
}

/**
 * 구조 돌파 직전 구간에서 포켓과 겹치는 **마지막 반대색 바디** — 단순 OB 참고(교육용).
 * 롱: 마지막 음봉 바디, 숏: 마지막 양봉 바디.
 */
function findObBodyInPocket(params: {
  candles: Candle[];
  scanEnd: number;
  pocketTop: number;
  pocketBot: number;
  bias: 'LONG' | 'SHORT';
  L: number;
}): { bodyLo: number; bodyHi: number } | null {
  const { candles, scanEnd, pocketTop, pocketBot, bias, L } = params;
  const n = candles.length;
  const span = Math.max(pocketTop - pocketBot, 1e-9);
  const eps = span * 0.08 + 1e-9;
  const pTop = pocketTop + eps;
  const pBot = pocketBot - eps;
  const iEnd = Math.min(scanEnd, n - 1);
  const iMin = Math.max(L, iEnd - 85);
  for (let i = iEnd; i >= iMin; i--) {
    const c = candles[i];
    if (!c) continue;
    const bodyTop = Math.max(c.open, c.close);
    const bodyBot = Math.min(c.open, c.close);
    if (bias === 'LONG' && c.close < c.open) {
      if (bodyTop >= pBot && bodyBot <= pTop) {
        return { bodyLo: bodyBot, bodyHi: bodyTop };
      }
    }
    if (bias === 'SHORT' && c.close > c.open) {
      if (bodyTop >= pBot && bodyBot <= pTop) {
        return { bodyLo: bodyBot, bodyHi: bodyTop };
      }
    }
  }
  return null;
}

/** 3캔들 FVG 갭이 타점 존과 겹치면 최근 것 1개(교육·참고) */
function findFvgOverlappingPocket(params: {
  candles: Candle[];
  end: number;
  pocketTop: number;
  pocketBot: number;
  bias: 'LONG' | 'SHORT' | 'NEUTRAL';
  L: number;
  minGapAbs: number;
}): { top: number; bot: number; polar: 'bull' | 'bear' } | null {
  const { candles, end, pocketTop, pocketBot, bias, L, minGapAbs } = params;
  const lo = Math.max(L + 2, end - 96);
  const touches = (gTop: number, gBot: number) =>
    Number.isFinite(gTop) &&
    Number.isFinite(gBot) &&
    gTop > gBot &&
    gTop >= pocketBot - 1e-12 &&
    gBot <= pocketTop + 1e-12 &&
    gTop - gBot >= minGapAbs;

  const scanBull = () => {
    for (let i = end; i >= lo; i--) {
      const c0 = candles[i - 2];
      const c2 = candles[i];
      if (!c0 || !c2) continue;
      if (c2.low > c0.high) {
        const gBot = c0.high;
        const gTop = c2.low;
        if (touches(gTop, gBot)) return { top: gTop, bot: gBot, polar: 'bull' as const };
      }
    }
    return null;
  };
  const scanBear = () => {
    for (let i = end; i >= lo; i--) {
      const c0 = candles[i - 2];
      const c2 = candles[i];
      if (!c0 || !c2) continue;
      if (c2.high < c0.low) {
        const gTop = c0.low;
        const gBot = c2.high;
        if (touches(gTop, gBot)) return { top: gTop, bot: gBot, polar: 'bear' as const };
      }
    }
    return null;
  };

  if (bias === 'LONG') return scanBull();
  if (bias === 'SHORT') return scanBear();
  return scanBull() ?? scanBear();
}

function appendAnalysisTooltip(
  base: string,
  alignKo: string | null | undefined,
  lastClose: number | undefined,
  pocketTop: number,
  pocketBot: number,
  bias: 'LONG' | 'SHORT' | 'NEUTRAL'
): string {
  const parts = [base.trim()];
  const ak = typeof alignKo === 'string' && alignKo.trim() ? alignKo.trim() : '';
  if (ak) parts.push(ak);
  const cl = lastClose;
  if (Number.isFinite(cl)) {
    if (cl <= pocketTop && cl >= pocketBot) {
      parts.push('종가: 타점 존 내부(반응 구간 근접, 참고).');
    } else if (bias === 'LONG' && cl < pocketBot) {
      parts.push('종가: 포켓 아래 — 깊은 되돌림·무효 근접 가능(참고).');
    } else if (bias === 'LONG' && cl > pocketTop) {
      parts.push('종가: 포켓 위 — 상방 이탈·재진입 관찰(참고).');
    } else if (bias === 'SHORT' && cl > pocketTop) {
      parts.push('종가: 포켓 위 — 깊은 되돌림·무효 근접 가능(참고).');
    } else if (bias === 'SHORT' && cl < pocketBot) {
      parts.push('종가: 포켓 아래 — 하방 이탈·재진입 관찰(참고).');
    }
  }
  return parts.join(' ');
}

export function buildMonthDeskTypeomOverlays(params: {
  candles: Candle[];
  timeframe?: string;
  swingPivot: number;
  scenario: ClosingEnvelopeFuturesScenario | null;
  stCore: InstitutionalSuperTrendCore | null;
  /** `monthDeskEnvelopeStructureAlignmentKo` — 존·HUD 정합 */
  envelopeStructureAlignKo?: string | null;
  /** 마감 엔진 HUD — 참고 강도 등 짧은 한 줄(메인 존 툴팁에만 덧붙임) */
  closingHudAugmentKo?: string | null;
  /** `/api/analyze` 5요소 확정 게이트 — zone 티어(확정/후보) */
  confirmedSignal?: MonthDeskConfirmedInput | null;
  /** 분석 verdict — 후보 방향 보조 */
  analyzeVerdict?: 'LONG' | 'SHORT' | null;
  /** `/api/analyze` 연합 연산 — E·SL·TP·타점 존 */
  analyzeFusion?: MonthDeskAnalysisFusionInput | null;
  /** 여러 존 중 핵심 롱 지지·반등 1곳 강조 (기본 켜짐) */
  coreLongHighlightEnabled?: boolean;
  /** 핵심 숏 저항·하락 1곳 강조 */
  coreShortHighlightEnabled?: boolean;
}): OverlayItem[] {
  const {
    candles,
    timeframe: timeframeRaw,
    swingPivot,
    scenario,
    stCore,
    envelopeStructureAlignKo,
    closingHudAugmentKo,
    confirmedSignal,
    analyzeVerdict,
    analyzeFusion,
    coreLongHighlightEnabled = true,
    coreShortHighlightEnabled = true,
  } = params;
  const n = candles.length;
  if (n < 12) return [];
  const chartTf = normalizeChartTimeframe(timeframeRaw ?? '4h');
  const htfPrecision = isMonthDeskHtfTimeframe(chartTf);
  const L = Math.max(2, Math.min(4, Math.floor(Number(swingPivot) || 2)));
  const end = n - 1;
  const lookback = monthDeskZoneLookbackBars(
    chartTf,
    Math.min(200, Math.max(32, n - L - 2))
  );
  const start = Math.max(L, n - lookback);
  const rng = rangeFromPivots(candles, L, start, end);
  if (!rng) return [];

  const marks = structureMarksFu(candles, L, 14);
  const lastMk = marks.length ? marks[marks.length - 1]! : null;

  const bias = scenario?.bias ?? 'NEUTRAL';
  const biasDir: 'LONG' | 'SHORT' | 'NEUTRAL' =
    bias === 'LONG' || bias === 'SHORT' ? bias : 'NEUTRAL';
  const endIdx = candles.length - 1;
  let pocket0 = computeTypeomPocket({
    candles,
    L,
    bias: biasDir,
    rng,
    lastMk,
  });
  if (!pocket0) return [];

  let { pocketTop, pocketBot, legHi, legLo, tZoneStart } = pocket0;

  if (htfPrecision) {
    const impulse = findRecentImpulseLeg(candles, L, start, end, biasDir);
    if (impulse) {
      legHi = impulse.legHi;
      legLo = impulse.legLo;
      if (Number.isFinite(impulse.tStart)) tZoneStart = impulse.tStart;
      const ote = htfOtePocketBounds(legHi, legLo, biasDir);
      if (ote) {
        pocketTop = Math.min(ote.pocketTop, legHi);
        pocketBot = Math.max(ote.pocketBot, legLo);
        if (pocketTop <= pocketBot) {
          pocketTop = ote.pocketTop;
          pocketBot = ote.pocketBot;
        }
      }
    }
  }
  const tail = candles.slice(Math.max(0, endIdx - 6), endIdx + 1);
  let bearBars = 0;
  let bullBars = 0;
  for (const c of tail) {
    if (c.close < c.open) bearBars++;
    else if (c.close > c.open) bullBars++;
  }
  const zoneResolve = resolveMonthDeskZoneSignal(scenario, confirmedSignal, analyzeVerdict, {
    close: Number(candles[endIdx]?.close),
    pocketTop,
    pocketBot,
    bearBars,
    bullBars,
  });

  const zoneResolveOnly = zoneResolve;
  const atr0 = atr14(candles);
  const snapped = snapPocketToStMid({
    pocketTop,
    pocketBot,
    legHi,
    legLo,
    stCore,
    endIdx: end,
    atrHint: atr0,
  });
  pocketTop = snapped.pocketTop;
  pocketBot = snapped.pocketBot;
  const mw = enforceMinPocketWidth(pocketTop, pocketBot, legHi, legLo, atr0);
  pocketTop = mw.pocketTop;
  pocketBot = mw.pocketBot;

  if (htfPrecision) {
    const refPx = Number(candles[end]?.close) || (pocketTop + pocketBot) / 2;
    const maxSpan = htfMaxPocketSpan({
      legHi,
      legLo,
      atr: atr0,
      refPrice: refPx,
      timeframe: chartTf,
    });
    const midPx = (pocketTop + pocketBot) / 2;
    const capped = capZoneVerticalSpan(pocketTop, pocketBot, midPx, maxSpan);
    pocketTop = Math.min(capped.top, legHi);
    pocketBot = Math.max(capped.bot, legLo);
    if (pocketTop <= pocketBot) {
      pocketTop = midPx + maxSpan / 2;
      pocketBot = midPx - maxSpan / 2;
    }
  }

  const t2 = Number(candles[end]?.time);
  if (!Number.isFinite(t2) || !Number.isFinite(tZoneStart)) return [];

  const fusion = computeMonthDeskUnifiedFusion({
    candles,
    timeframe: chartTf,
    pocketTop,
    pocketBot,
    legHi,
    legLo,
    scenario,
    confirmedSignal,
    analyze: analyzeFusion,
    stCore,
    zoneResolveSignal: zoneResolveOnly.signal,
  });

  pocketTop = fusion.zoneTop;
  pocketBot = fusion.zoneBot;
  const signal = fusion.displaySignal;
  const pal = monthDeskZonePalette(signal);

  const mid = fusion.entry;
  const pocketSpan = Math.max(pocketTop - pocketBot, 1e-9);
  const leg = Math.max(legHi - legLo, 1e-12);
  const atr = atr0;
  const rHi = rng.swingHigh;
  const rLo = rng.swingLow;

  const baseLine = (partial: Omit<OverlayItem, 'x1' | 'y1' | 'x2' | 'y2' | 'confidence'>): OverlayItem => ({
    ...partial,
    x1: 0,
    y1: 0,
    x2: 1,
    y2: 0,
    confidence: 76,
    time1: Math.min(tZoneStart, t2),
    time2: t2,
  });

  /** 차트에서 타점 존·코어를 네온 테두리+펄스로 강조 — `zoneDirectionalColors`가 덮지 않도록 id 프리픽스 사용 */
  function monthDeskTypeomEntryZoneChrome(signal: MonthDeskZoneSignal, tier: 'pocket' | 'core') {
    const pal = monthDeskZonePalette(signal);
    return {
      zonePulse: true,
      overlayZoneExtraClass: `overlay-zone--monthdesk-typeom-${tier} overlay-zone--monthdesk-typeom--${pal.cssDir}`,
    };
  }

  const out: OverlayItem[] = [];

  const lastClose = Number(candles[end]?.close);
  const tZoneEnd = t2;
  const tZoneLo = Math.min(tZoneStart, tZoneEnd);

  const tChartStart = Number(candles[start]?.time);
  const tZoneDrawStart =
    htfPrecision && Number.isFinite(tChartStart)
      ? Math.min(tChartStart, tZoneStart, tZoneEnd)
      : Math.min(tZoneStart, tZoneEnd);
  out.push(...buildMonthDeskUnifiedZoneOverlays(fusion, tZoneDrawStart, tZoneEnd, signal));
  out.push(...buildMonthDeskTradeDeskPlanOverlays(fusion, tZoneDrawStart, tZoneEnd, signal));

  /** 포켓 면은 `month-desk-unified-zone`과 중복 — 연합 zone만 사용 */

  const minFvgGap = Math.max(atr * 0.014, leg * 0.0009, pocketSpan * 0.018);
  const fvgHit = findFvgOverlappingPocket({
    candles,
    end,
    pocketTop,
    pocketBot,
    bias,
    L,
    minGapAbs: minFvgGap,
  });
  if (fvgHit) {
    const fSpan = fvgHit.top - fvgHit.bot;
    const nested =
      fvgHit.bot >= pocketBot - 1e-9 &&
      fvgHit.top <= pocketTop + 1e-9 &&
      fSpan >= (pocketTop - pocketBot) * 0.88;
    if (!nested) {
      const fKind: OverlayItem['kind'] = fvgHit.polar === 'bear' ? 'supplyZone' : 'demandZone';
      out.push({
        id: 'month-desk-typeom-fvg-zone',
        kind: fKind,
        label: fvgHit.polar === 'bull' ? 'FVG·수요(참고)' : 'FVG·공급(참고)',
        x1: 0,
        y1: 0,
        x2: 1,
        y2: 0,
        time1: Math.min(tZoneStart, t2),
        time2: t2,
        price1: fvgHit.top,
        price2: fvgHit.bot,
        confidence: 72,
        color:
          fvgHit.polar === 'bull' ? 'rgba(56,189,248,0.16)' : 'rgba(244,114,182,0.15)',
        category: 'scenario',
        labelTooltip: appendAnalysisTooltip(
          '3캔들 갭(FVG)이 타점 존과 겹침 — 유동성·재진입 참고(확정 아님).',
          envelopeStructureAlignKo,
          lastClose,
          fvgHit.top,
          fvgHit.bot,
          bias
        ),
        zoneFillPreserve: true,
        overlayZoneExtraClass: `overlay-zone--monthdesk-typeom-fvg overlay-zone--monthdesk-typeom--${
          fvgHit.polar === 'bull' ? 'long' : 'short'
        }`,
      } as OverlayItem);
    }
  }

  out.push(
    baseLine({
      id: 'month-desk-typeom-entry',
      kind: 'keyLevel',
      label: pal.entryLabel,
      price1: mid,
      price2: mid,
      color: pal.entryLine,
      lineLabelColor: '#e0f2fe',
      lineDash: monthDeskZoneIsWait(signal) ? '6 4' : undefined,
      lineStrokeWidth:
        signal === 'CONFIRMED_LONG' || signal === 'CONFIRMED_SHORT'
          ? 4
          : signal === 'LONG_CANDIDATE' || signal === 'SHORT_CANDIDATE'
            ? 3
            : 3,
      category: 'scenario',
      labelTooltip: monthDeskZoneIsWait(signal)
        ? `대기 — ${fusion.headlineKo} · 체결·상위 TF 확인.`
        : `${pal.entryLabel}(연합 E): ${fmtPx(mid)} — ${fusion.headlineKo}`,
    })
  );

  out.push(
    baseLine({
      id: 'month-desk-typeom-eq-mid',
      kind: 'keyLevel',
      label: 'EQ50',
      price1: mid,
      price2: mid,
      color: 'rgba(148,163,184,0.55)',
      lineLabelColor: '#cbd5e1',
      lineStrokeWidth: 1,
      lineDash: '4 6',
      category: 'scenario',
      labelTooltip: '포켓 중심(50%) 보조선.',
    })
  );

  const obScanEnd = lastMk && lastMk.index > 0 ? lastMk.index - 1 : Math.max(L, end - 2);
  if (bias === 'LONG' || bias === 'SHORT') {
    const ob = findObBodyInPocket({
      candles,
      scanEnd: obScanEnd,
      pocketTop,
      pocketBot,
      bias,
      L,
    });
    if (ob && ob.bodyHi > ob.bodyLo) {
      const obLoCol = bias === 'LONG' ? 'rgba(34,211,238,0.82)' : 'rgba(251,146,60,0.78)';
      const obLoLab = bias === 'LONG' ? '#a5f3fc' : '#fed7aa';
      const obHiCol = bias === 'LONG' ? 'rgba(6,182,212,0.58)' : 'rgba(251,146,60,0.52)';
      out.push(
        baseLine({
          id: 'month-desk-typeom-ob-lo',
          kind: 'keyLevel',
          label: 'OB·바디하',
          price1: ob.bodyLo,
          price2: ob.bodyLo,
          color: obLoCol,
          lineLabelColor: obLoLab,
          lineDash: '3 5',
          lineStrokeWidth: 1,
          category: 'scenario',
          labelTooltip:
            bias === 'LONG'
              ? '돌파 직전 음봉 바디 하단 — 수요 OB 단순화(참고).'
              : '돌파 직전 양봉 바디 하단 — 공급 OB 단순화(참고).',
        })
      );
      out.push(
        baseLine({
          id: 'month-desk-typeom-ob-hi',
          kind: 'keyLevel',
          label: 'OB·바디상',
          price1: ob.bodyHi,
          price2: ob.bodyHi,
          color: obHiCol,
          lineLabelColor: obLoLab,
          lineDash: '3 5',
          lineStrokeWidth: 1,
          category: 'scenario',
          labelTooltip: '동일 반대봉 바디 상단.',
        })
      );
    }

    const fib50Px = bias === 'LONG' ? legHi - 0.5 * leg : legLo + 0.5 * leg;
    if (Number.isFinite(fib50Px) && fib50Px > legLo && fib50Px < legHi) {
      out.push(
        baseLine({
          id: 'month-desk-typeom-leg-fib50',
          kind: 'keyLevel',
          label: '레그·50%',
          price1: fib50Px,
          price2: fib50Px,
          color: 'rgba(148,163,184,0.82)',
          lineLabelColor: '#cbd5e1',
          lineDash: '4 6',
          lineStrokeWidth: 1,
          category: 'scenario',
          labelTooltip: '현재 레그 길이 기준 되돌림 50% — 포켓 중심과 구분.',
        })
      );
    }

    if (bias === 'LONG') {
      const ote79 = legHi - 0.79 * leg;
      if (Number.isFinite(ote79) && ote79 > legLo && ote79 < pocketBot - pocketSpan * 0.02) {
        out.push(
          baseLine({
            id: 'month-desk-typeom-ote-deep',
            kind: 'keyLevel',
            label: '깊은·79%',
            price1: ote79,
            price2: ote79,
            color: 'rgba(250,204,21,0.55)',
            lineLabelColor: '#fde047',
            lineDash: '2 6',
            lineStrokeWidth: 1,
            category: 'scenario',
            labelTooltip: '골든포켓보다 깊은 되돌림(약 79%) 참고선 — 무조건 반등 아님.',
          })
        );
      }
    } else {
      const ote79s = legLo + 0.79 * leg;
      if (Number.isFinite(ote79s) && ote79s < legHi && ote79s > pocketTop + pocketSpan * 0.02) {
        out.push(
          baseLine({
            id: 'month-desk-typeom-ote-deep',
            kind: 'keyLevel',
            label: '깊은·79%(프리)',
            price1: ote79s,
            price2: ote79s,
            color: 'rgba(251,146,60,0.45)',
            lineLabelColor: '#fed7aa',
            lineDash: '2 6',
            lineStrokeWidth: 1,
            category: 'scenario',
            labelTooltip: '포켓보다 위쪽 깊은 프리미엄 되돌림 참고선.',
          })
        );
      }
    }
  }

  const invScenario = scenario?.invalidationPrice;
  const invSide = scenario?.invalidationSide;

  const tradeDir: 'LONG' | 'SHORT' | null =
    fusion.direction !== 'WAIT'
      ? fusion.direction
      : fusion.scoreLong > fusion.scoreShort + 0.5
        ? 'LONG'
        : fusion.scoreShort > fusion.scoreLong + 0.5
          ? 'SHORT'
          : null;

  if (tradeDir === 'LONG') {
    const invPx = fusion.stopLoss;
    out.push(
      baseLine({
        id: 'month-desk-typeom-inv',
        kind: 'keyLevel',
        label: pal.slLabel,
        price1: invPx,
        price2: invPx,
        color: pal.slLine,
        lineLabelColor: '#fecaca',
        lineDash: '5 4',
        lineStrokeWidth: 2,
        category: 'scenario',
        labelTooltip: `손절(SL) 참고: ${fmtPx(invPx)} 아래 종가 유지 시 롱 전제 약화.`,
      })
    );
    const tp1 = fusion.tp1;
    const tp2 = fusion.tp2;
    const tp3 = fusion.tp3;
    out.push(
      baseLine({
        id: 'month-desk-typeom-tp1',
        kind: 'keyLevel',
        label: `${pal.tpLabel} TP1`,
        price1: tp1,
        price2: tp1,
        color: pal.tpLine,
        lineLabelColor: '#bbf7d0',
        lineDash: '8 5',
        lineStrokeWidth: 2,
        category: 'scenario',
        labelTooltip: '수익 TP1: 현재 레그 고점 근처(참고).',
      })
    );
    out.push(
      baseLine({
        id: 'month-desk-typeom-tp2',
        kind: 'keyLevel',
        label: `${pal.tpLabel} TP2`,
        price1: tp2,
        price2: tp2,
        color: pal.tpLineSoft,
        lineLabelColor: '#86efac',
        lineDash: '8 6',
        lineStrokeWidth: 2,
        category: 'scenario',
        labelTooltip: '수익 TP2: 단기 확장(참고).',
      })
    );
    out.push(
      baseLine({
        id: 'month-desk-typeom-tp3',
        kind: 'keyLevel',
        label: `${pal.tpLabel} TP3`,
        price1: tp3,
        price2: tp3,
        color: pal.tpLineSoft,
        lineLabelColor: '#86efac',
        lineDash: '6 8',
        lineStrokeWidth: 1,
        category: 'scenario',
        labelTooltip: '수익 TP3: 더 먼 확장 — 참고만.',
      })
    );
    const fu = stCore?.finalUpper?.[end];
    if (typeof fu === 'number' && Number.isFinite(fu) && fu > mid) {
      out.push(
        baseLine({
          id: 'month-desk-typeom-tp-band',
          kind: 'keyLevel',
          label: 'TP·존상',
          price1: fu,
          price2: fu,
          color: 'rgba(251,191,36,0.72)',
          lineLabelColor: '#fde68a',
          lineDash: '6 10',
          lineStrokeWidth: 1,
          category: 'scenario',
          labelTooltip: '마감존 상단(SuperTrend) 근접 참고 목표.',
        })
      );
    }
  } else if (tradeDir === 'SHORT') {
    const invPx = fusion.stopLoss;
    out.push(
      baseLine({
        id: 'month-desk-typeom-inv',
        kind: 'keyLevel',
        label: pal.slLabel,
        price1: invPx,
        price2: invPx,
        color: pal.slLine,
        lineLabelColor: '#fecaca',
        lineDash: '5 4',
        lineStrokeWidth: 2,
        category: 'scenario',
        labelTooltip: `손절(SL) 참고: ${fmtPx(invPx)} 위 종가 유지 시 숏 전제 약화.`,
      })
    );
    const tp1 = fusion.tp1;
    const tp2 = fusion.tp2;
    const tp3 = fusion.tp3;
    out.push(
      baseLine({
        id: 'month-desk-typeom-tp1',
        kind: 'keyLevel',
        label: `${pal.tpLabel} TP1`,
        price1: tp1,
        price2: tp1,
        color: pal.tpLine,
        lineLabelColor: '#bbf7d0',
        lineDash: '8 5',
        lineStrokeWidth: 2,
        category: 'scenario',
        labelTooltip: '수익 TP1: 현재 레그 저점 근처(참고).',
      })
    );
    out.push(
      baseLine({
        id: 'month-desk-typeom-tp2',
        kind: 'keyLevel',
        label: `${pal.tpLabel} TP2`,
        price1: tp2,
        price2: tp2,
        color: pal.tpLineSoft,
        lineLabelColor: '#86efac',
        lineDash: '8 6',
        lineStrokeWidth: 2,
        category: 'scenario',
        labelTooltip: '수익 TP2: 단기 확장(참고).',
      })
    );
    out.push(
      baseLine({
        id: 'month-desk-typeom-tp3',
        kind: 'keyLevel',
        label: `${pal.tpLabel} TP3`,
        price1: tp3,
        price2: tp3,
        color: pal.tpLineSoft,
        lineLabelColor: '#86efac',
        lineDash: '6 8',
        lineStrokeWidth: 1,
        category: 'scenario',
        labelTooltip: '수익 TP3: 더 먼 확장 — 참고만.',
      })
    );
    const fl = stCore?.finalLower?.[end];
    if (typeof fl === 'number' && Number.isFinite(fl) && fl < mid) {
      out.push(
        baseLine({
          id: 'month-desk-typeom-tp-band',
          kind: 'keyLevel',
          label: 'TP·존하',
          price1: fl,
          price2: fl,
          color: 'rgba(251,191,36,0.72)',
          lineLabelColor: '#fde68a',
          lineDash: '6 10',
          lineStrokeWidth: 1,
          category: 'scenario',
          labelTooltip: '마감존 하단(SuperTrend) 근접 참고 목표.',
        })
      );
    }
  } else {
    if (Number.isFinite(Number(invScenario)) && (invSide === 'below' || invSide === 'above')) {
      out.push(
        baseLine({
          id: 'month-desk-typeom-inv-env',
          kind: 'keyLevel',
          label: invSide === 'below' ? '무효(하)' : '무효(상)',
          price1: Number(invScenario),
          price2: Number(invScenario),
          color: 'rgba(148,163,184,0.85)',
          lineLabelColor: '#e2e8f0',
          lineDash: '4 4',
          category: 'scenario',
          labelTooltip: '마감존 시나리오 무효화 참고가.',
        })
      );
    }
    out.push(
      baseLine({
        id: 'month-desk-typeom-tp1-up',
        kind: 'keyLevel',
        label: 'TP1↑ 레그고',
        price1: legHi,
        price2: legHi,
        color: 'rgba(167,139,250,0.65)',
        lineLabelColor: '#ddd6fe',
        lineDash: '8 6',
        category: 'scenario',
        labelTooltip: '상방 참고: 레그 고.',
      })
    );
    out.push(
      baseLine({
        id: 'month-desk-typeom-tp1-dn',
        kind: 'keyLevel',
        label: 'TP1↓ 레그저',
        price1: legLo,
        price2: legLo,
        color: 'rgba(167,139,250,0.65)',
        lineLabelColor: '#ddd6fe',
        lineDash: '8 6',
        category: 'scenario',
        labelTooltip: '하방 참고: 레그 저.',
      })
    );
  }

  const coreLong = computeMonthDeskCoreLongEntry({
    candles,
    timeframe: chartTf,
    swingPivot: L,
    fusion,
    legHi,
    legLo,
    pocketTop,
    pocketBot,
    swingHigh: rHi,
    swingLow: rLo,
    stCore,
    scenario,
    enabled: coreLongHighlightEnabled,
  });
  if (coreLong) {
    out.push(...buildMonthDeskCoreLongEntryOverlays(coreLong, Math.min(tZoneStart, t2), t2));
  }

  const coreShort = computeMonthDeskCoreShortEntry({
    candles,
    timeframe: chartTf,
    swingPivot: L,
    fusion,
    legHi,
    legLo,
    pocketTop,
    pocketBot,
    swingHigh: rHi,
    swingLow: rLo,
    stCore,
    scenario,
    enabled: coreShortHighlightEnabled,
  });
  if (coreShort) {
    out.push(...buildMonthDeskCoreShortEntryOverlays(coreShort, Math.min(tZoneStart, t2), t2));
  }

  return out;
}
