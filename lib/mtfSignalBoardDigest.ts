import type { Candle, OverlayItem } from '@/types';
import { normalizeChartTimeframe, visibleLimit } from '@/lib/constants';
import {
  computeLargeBodyCandlePreview,
  lastBarSmcLargeKind,
  recentSmcJangPresence,
  smcLargeKindAt,
} from '@/lib/largeBodyCandlePreviewMarkers';
import {
  computeClosingEnvelopeFuturesScenario,
  computeInstitutionalBandInteractionMarkersUnion,
  computeInstitutionalSuperTrendCore,
  INSTITUTIONAL_BAND_DEFAULT_MULT,
  INSTITUTIONAL_BAND_DEFAULT_PERIOD,
  institutionalBandTouchMinGapBars,
} from '@/lib/institutionalSuperBand';
import { sanitizeChartCandlesForSeries } from '@/lib/volumeHistogramIntelligence';

/** 마감·안착 차트 `candlesForMonthDeskWork` 슬라이스와 동일 — ⟡ 시나리오 ST 경로 일치 */
export function sliceCandlesForMonthDeskClosingScenario(tf: string, candles: Candle[]): Candle[] {
  const lim = visibleLimit(tf);
  const cap = Math.min(920, Math.max(280, Math.round(lim + lim * 0.42 + 160)));
  if (candles.length <= cap) return candles;
  return candles.slice(-cap);
}

export type MtfBarFlags = {
  rocket: boolean;
  /** 구조 로켓 방향 — 마지막·직전 봉 시각 일치 시만 */
  rocketLong: boolean;
  rocketShort: boolean;
  deltaYang: boolean;
  deltaEum: boolean;
  jangEum: boolean;
  band: boolean;
  /** 기관 밴드 접촉 방향(마커 verdict) — 마지막·직전 봉 */
  bandLong: boolean;
  bandShort: boolean;
  lh: boolean;
  /** 마감존 참고 시나리오(차트 ⟡L/⟡S/⟡↔) — 마지막 봉만 */
  closingLong: boolean;
  closingShort: boolean;
  closingNeutral: boolean;
};

/** 홈 MTF 배치·차트 우측 게이지용 — 각 TF analyze JSON에서 요약 */
export type MtfSignalBoardDigest = {
  rocket: boolean;
  delta: boolean;
  jangEum: boolean;
  band: boolean;
  lh: boolean;
  /** 마지막 봉(현재봉) */
  lastBar: MtfBarFlags;
  /** 바로 이전 봉(전봉) */
  prevBar: MtfBarFlags;
};

/** MTF 카드·텔레: 현재봉·직전봉 열 중 하나라도 켜지면 true (클라·서버 공통, crypto 미사용) */
export function mtfBarAny(f: MtfBarFlags): boolean {
  return !!(
    f.rocket ||
    f.rocketLong ||
    f.rocketShort ||
    f.deltaYang ||
    f.deltaEum ||
    f.jangEum ||
    f.band ||
    f.bandLong ||
    f.bandShort ||
    f.lh ||
    f.closingLong ||
    f.closingShort ||
    f.closingNeutral
  );
}

/** MTF 카드 한 줄: 「현」또는 「전」 컬럼에 신호가 있으면 true */
export function mtfBoardDigestRowHot(board: MtfSignalBoardDigest | undefined): boolean {
  if (!board) return false;
  return mtfBarAny(board.lastBar) || mtfBarAny(board.prevBar);
}

/**
 * 15m~1M: **마지막·직전 봉**에만 — 구조 로켓 LONG/SHORT 또는 기관 밴드 LONG/SHORT.
 * (△·⟡·LH 등은 제외 — 사용자 지정 “신호 감지” 기준)
 */
export function mtfBarRocketBandOnly(f: MtfBarFlags): boolean {
  return !!(
    f.rocketLong ||
    f.rocketShort ||
    f.bandLong ||
    f.bandShort
  );
}

export function mtfBoardDigestRocketBandLastPrevHot(board: MtfSignalBoardDigest | undefined): boolean {
  if (!board) return false;
  return mtfBarRocketBandOnly(board.lastBar) || mtfBarRocketBandOnly(board.prevBar);
}

function emptyFlags(): MtfBarFlags {
  return {
    rocket: false,
    rocketLong: false,
    rocketShort: false,
    deltaYang: false,
    deltaEum: false,
    jangEum: false,
    band: false,
    bandLong: false,
    bandShort: false,
    lh: false,
    closingLong: false,
    closingShort: false,
    closingNeutral: false,
  };
}

/**
 * 엔진이 넣는 시각이 봉 시가와 다를 수 있음 — ChartView `candleOpenContainingTime` 과 동일.
 */
function candleOpenContainingTime(candles: Candle[], entrySec: number): number | null {
  const n = candles.length;
  if (!n || !Number.isFinite(entrySec)) return null;
  const firstT = Number(candles[0].time);
  if (entrySec < firstT) return null;
  let lo = 0;
  let hi = n - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const ct = Number(candles[mid].time);
    if (ct <= entrySec) {
      ans = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  if (ans < 0) return null;
  return Number(candles[ans].time);
}

function rocketLongShortAtBar(
  rockets: Array<{ time?: number; direction?: string }> | undefined,
  candles: Candle[],
  barOpenTime: number,
): { long: boolean; short: boolean } {
  let long = false;
  let short = false;
  if (!Array.isArray(rockets) || !Number.isFinite(barOpenTime)) return { long, short };
  for (const r of rockets) {
    if (r == null) continue;
    const rt = Number(r.time);
    if (!Number.isFinite(rt)) continue;
    const atBarOpen = candleOpenContainingTime(candles, rt) ?? rt;
    if (atBarOpen !== barOpenTime) continue;
    const d = String(r.direction || '').toUpperCase();
    if (d === 'LONG') long = true;
    if (d === 'SHORT') short = true;
  }
  return { long, short };
}

function overlayFlagsForBarTime(
  overlays: Array<{ label?: string; kind?: string; time1?: number; time2?: number }> | undefined,
  candles: Candle[],
  barTime: number,
): { band: boolean; lh: boolean } {
  let band = false;
  let lh = false;
  if (!Array.isArray(overlays)) return { band, lh };
  for (const o of overlays) {
    const t1 = o.time1 != null ? Number(o.time1) : NaN;
    const t2 = o.time2 != null ? Number(o.time2) : NaN;
    const o1 = Number.isFinite(t1) ? candleOpenContainingTime(candles, t1) ?? t1 : NaN;
    const o2 = Number.isFinite(t2) ? candleOpenContainingTime(candles, t2) ?? t2 : NaN;
    const hit = (Number.isFinite(o1) && o1 === barTime) || (Number.isFinite(o2) && o2 === barTime);
    if (!hit) continue;
    const lab = String(o.label || '');
    if (/ST·|기관밴드|SuperTrend|Institutional/i.test(lab)) band = true;
    if (/\bLH\b|LH★|Lower\s*High/i.test(lab)) lh = true;
  }
  return { band, lh };
}

function deltaTripletFromMarkers(
  markers: Array<{ time?: number; text?: string }>,
  barTime: number
): { yang: boolean; eum: boolean } {
  const mk = markers.find((m) => Number((m as { time?: number }).time) === barTime);
  const tx = String((mk as { text?: string })?.text || '');
  return { yang: /^△양/.test(tx), eum: /^△음/.test(tx) };
}

/**
 * /api/analyze 응답 일부만으로 플래그 계산.
 * `lastBar` = 마지막 캔들, `prevBar` = 그 직전 캔들.
 */
export function digestMtfSignalBoard(d: {
  candles?: Candle[];
  timeframe?: string;
  structureRocketSignals?: Array<{ time?: number; direction?: 'LONG' | 'SHORT' }>;
  overlays?: Array<{ label?: string; kind?: string; time1?: number; time2?: number }>;
  /**
   * 차트 기관밴드 접촉 마커와 동일 등급 필터.
   * 없으면 기본 `{ A,B on / C off }`(설정 `minTier=B` 근사).
   */
  bandTouchTierMask?: { A: boolean; B: boolean; C: boolean };
}): MtfSignalBoardDigest {
  const tf = normalizeChartTimeframe(String(d.timeframe || '4h'));
  const rockets = d.structureRocketSignals;
  const rocket = Array.isArray(rockets) && rockets.length > 0;

  let delta = false;
  let jangEum = false;

  const empty = emptyFlags();
  const raw = d.candles;
  if (!Array.isArray(raw) || raw.length < 1) {
    return { rocket, delta: false, jangEum: false, band: false, lh: false, lastBar: empty, prevBar: empty };
  }
  /** 차트 시리즈와 동일: 동일 시각 중복 제거·정렬(ChartView `computeLargeBodyCandlePreview` 등과 일치) */
  const candles = sanitizeChartCandlesForSeries(raw);
  if (candles.length < 1) {
    return { rocket, delta: false, jangEum: false, band: false, lh: false, lastBar: empty, prevBar: empty };
  }

  const n = candles.length;
  const lastT = Number(candles[n - 1]!.time);
  const prevT = n >= 2 ? Number(candles[n - 2]!.time) : NaN;

  const rLast = rocketLongShortAtBar(rockets, candles, lastT);
  const rPrev =
    n >= 2 && Number.isFinite(prevT) ? rocketLongShortAtBar(rockets, candles, prevT) : { long: false, short: false };
  const lastBarRocket = rLast.long || rLast.short;
  const prevBarRocket = rPrev.long || rPrev.short;

  let deltaYangLast = false;
  let deltaEumLast = false;
  let deltaYangPrev = false;
  let deltaEumPrev = false;

  if (candles.length >= 18) {
    /** 옵션 생략 = 차트 기본(lookback 720 · maxMarkers 480)과 동일 */
    const lb = computeLargeBodyCandlePreview(candles, tf);
    delta = lb.markers.some((m) => {
      const x = String((m as { text?: string }).text || '');
      return x.startsWith('△');
    });
    const mkLast = deltaTripletFromMarkers(lb.markers as Array<{ time?: number; text?: string }>, lastT);
    deltaYangLast = mkLast.yang;
    deltaEumLast = mkLast.eum;
    if (n >= 2 && Number.isFinite(prevT)) {
      const mkPrev = deltaTripletFromMarkers(lb.markers as Array<{ time?: number; text?: string }>, prevT);
      deltaYangPrev = mkPrev.yang;
      deltaEumPrev = mkPrev.eum;
    }

    jangEum = recentSmcJangPresence(candles, tf, 18).jangEum;
  }

  const lbKind = candles.length >= 18 ? lastBarSmcLargeKind(candles, tf) : null;
  const jangEumLast = lbKind === '장음';
  const prevIdx = n >= 2 ? n - 2 : -1;
  const prevKind = prevIdx >= 14 && candles.length >= 18 ? smcLargeKindAt(candles, tf, prevIdx) : null;
  const jangEumPrev = prevKind === '장음';

  let band = false;
  let lh = false;
  const ovs = d.overlays;
  if (Array.isArray(ovs)) {
    for (const o of ovs) {
      const lab = String(o.label || '');
      if (/ST·|기관밴드|SuperTrend|Institutional/i.test(lab)) band = true;
      if (/\bLH\b|LH★|Lower\s*High/i.test(lab)) lh = true;
    }
  }
  const obLast = overlayFlagsForBarTime(ovs, candles, lastT);
  const obPrev =
    n >= 2 && Number.isFinite(prevT) ? overlayFlagsForBarTime(ovs, candles, prevT) : { band: false, lh: false };

  /** 차트 우측 기관밴드 접촉 마커(ST·L/S 등) — API overlays에는 없고 클라에서만 계산되는 경우가 많음 */
  const tierMask =
    d.bandTouchTierMask ?? ({ A: true, B: true, C: false } satisfies { A: boolean; B: boolean; C: boolean });
  let ibTouchAtLast = false;
  let ibTouchAtPrev = false;
  let ibAnyTouch = false;
  let ibLongLast = false;
  let ibShortLast = false;
  let ibLongPrev = false;
  let ibShortPrev = false;
  if (candles.length >= 7) {
    const ibMarks = computeInstitutionalBandInteractionMarkersUnion(
      candles,
      INSTITUTIONAL_BAND_DEFAULT_PERIOD,
      INSTITUTIONAL_BAND_DEFAULT_MULT,
      {
        minBarsBetween: institutionalBandTouchMinGapBars(tf),
        tierEnabled: tierMask,
        overlays: Array.isArray(ovs) ? (ovs as OverlayItem[]) : [],
      },
    );
    for (const m of ibMarks) {
      const tm = Number(m.time);
      if (!Number.isFinite(tm)) continue;
      const barOpen = candleOpenContainingTime(candles, tm) ?? tm;
      ibAnyTouch = true;
      if (barOpen === lastT) {
        ibTouchAtLast = true;
        if (m.verdict === 'LONG') ibLongLast = true;
        if (m.verdict === 'SHORT') ibShortLast = true;
      }
      if (n >= 2 && Number.isFinite(prevT) && barOpen === prevT) {
        ibTouchAtPrev = true;
        if (m.verdict === 'LONG') ibLongPrev = true;
        if (m.verdict === 'SHORT') ibShortPrev = true;
      }
    }
    band = band || ibAnyTouch;
  }

  const lastBand = obLast.band || ibTouchAtLast;
  const prevBand = obPrev.band || ibTouchAtPrev;

  let closingLongLast = false;
  let closingShortLast = false;
  let closingNeutralLast = false;
  const work = sliceCandlesForMonthDeskClosingScenario(tf, candles);
  if (work.length >= 7) {
    const core = computeInstitutionalSuperTrendCore(
      work,
      INSTITUTIONAL_BAND_DEFAULT_PERIOD,
      INSTITUTIONAL_BAND_DEFAULT_MULT,
    );
    const scen = computeClosingEnvelopeFuturesScenario(
      work,
      INSTITUTIONAL_BAND_DEFAULT_PERIOD,
      INSTITUTIONAL_BAND_DEFAULT_MULT,
      core,
    );
    if (scen) {
      if (scen.bias === 'LONG') closingLongLast = true;
      else if (scen.bias === 'SHORT') closingShortLast = true;
      else closingNeutralLast = true;
    }
  }

  return {
    rocket,
    delta,
    jangEum,
    band,
    lh,
    lastBar: {
      rocket: lastBarRocket,
      rocketLong: rLast.long,
      rocketShort: rLast.short,
      deltaYang: deltaYangLast,
      deltaEum: deltaEumLast,
      jangEum: jangEumLast,
      band: lastBand,
      bandLong: ibLongLast,
      bandShort: ibShortLast,
      lh: obLast.lh,
      closingLong: closingLongLast,
      closingShort: closingShortLast,
      closingNeutral: closingNeutralLast,
    },
    prevBar: {
      rocket: prevBarRocket,
      rocketLong: rPrev.long,
      rocketShort: rPrev.short,
      deltaYang: deltaYangPrev,
      deltaEum: deltaEumPrev,
      jangEum: jangEumPrev,
      band: prevBand,
      bandLong: ibLongPrev,
      bandShort: ibShortPrev,
      lh: obPrev.lh,
      closingLong: false,
      closingShort: false,
      closingNeutral: false,
    },
  };
}

/** 마지막·직전 봉에서 L/S 방향 플래그(로켓·밴드 공통) */
export type MtfDisplayedRocketPair = { long: boolean; short: boolean };

export type MtfDisplayedRocketLastPrev = {
  lastBar: MtfDisplayedRocketPair;
  prevBar: MtfDisplayedRocketPair;
};

/** 기관 밴드 터치 마커 — `ChartView` `markerLooksLikeInstitutionalBandTouch`와 동일 규칙 */
export function chartMarkerRowLooksLikeInstitutionalBandTouch(m: {
  text?: string;
  shape?: string;
}): boolean {
  const sh = String(m.shape ?? '');
  if (sh !== 'arrowUp' && sh !== 'arrowDown') return false;
  const tx = String(m.text ?? '').trim();
  return /^[⚡]?[LS][HP]?[★◆·]$/.test(tx);
}

/** `MtfDisplayedRocketLastPrev`와 동일 구조 — 밴드 전용 타입 별칭 */
export type MtfDisplayedBandLastPrev = MtfDisplayedRocketLastPrev;

function emptyMtfDisplayedRockets(): MtfDisplayedRocketLastPrev {
  const z = { long: false, short: false };
  return { lastBar: { ...z }, prevBar: { ...z } };
}

/**
 * `markersApi.setMarkers` 직전 **최종** 마커만으로 직전·마지막 봉의 구조 로켓 L/S를 복원.
 * L·S(확정) 마커는 제외(텍스트가 L/S·점수로만 쓰인 경우).
 */
export function extractMtfRocketsFromChartMarkerRows(
  markers: Array<{ time?: unknown; text?: string; shape?: string }>,
  lastBarOpen: number,
  prevBarOpen: number | null,
): MtfDisplayedRocketLastPrev {
  const out = emptyMtfDisplayedRockets();
  if (!Number.isFinite(lastBarOpen) || lastBarOpen <= 0) return out;
  const prevT = prevBarOpen != null && Number.isFinite(prevBarOpen) ? prevBarOpen : null;

  const classify = (text: string): { long: boolean; short: boolean } => {
    const tx = String(text || '');
    if (!tx) return { long: false, short: false };
    if (tx.includes('⚡↔')) return { long: true, short: true };
    const hasDump = tx.includes('📉');
    const hasRocket = tx.includes('🚀');
    if (hasRocket && hasDump) return { long: true, short: true };
    if (hasDump) return { long: false, short: true };
    if (hasRocket) return { long: true, short: false };
    return { long: false, short: false };
  };

  for (const m of markers) {
    const tm = Number((m as { time?: unknown }).time);
    if (!Number.isFinite(tm)) continue;
    const tx = String((m as { text?: string }).text ?? '');
    if (!/🚀|📉|⚡/.test(tx)) continue;

    const { long: lg, short: sh } = classify(tx);
    if (!lg && !sh) continue;

    if (tm === lastBarOpen) {
      if (lg) out.lastBar.long = true;
      if (sh) out.lastBar.short = true;
    }
    if (prevT !== null && tm === prevT) {
      if (lg) out.prevBar.long = true;
      if (sh) out.prevBar.short = true;
    }
  }
  return out;
}

function classifyInstitutionalBandMarkerText(text: string): { long: boolean; short: boolean } {
  const tx = String(text || '').trim();
  if (!/^[⚡]?[LS][HP]?[★◆·]$/.test(tx)) return { long: false, short: false };
  if (/^[⚡]?L/.test(tx)) return { long: true, short: false };
  if (/^[⚡]?S/.test(tx)) return { long: false, short: true };
  return { long: false, short: false };
}

/**
 * 최종 마커에서 기관 밴드 터치(화살표 + `L★`/`SH◆` 등)만 집계 — `digest`의 IB 계산과 달라질 수 있음(누적·융합 필터).
 */
export function extractMtfBandsFromChartMarkerRows(
  markers: Array<{ time?: unknown; text?: string; shape?: string }>,
  lastBarOpen: number,
  prevBarOpen: number | null,
): MtfDisplayedBandLastPrev {
  const out = emptyMtfDisplayedRockets();
  if (!Number.isFinite(lastBarOpen) || lastBarOpen <= 0) return out;
  const prevT = prevBarOpen != null && Number.isFinite(prevBarOpen) ? prevBarOpen : null;

  for (const m of markers) {
    if (!chartMarkerRowLooksLikeInstitutionalBandTouch(m as { text?: string; shape?: string })) continue;
    const tm = Number((m as { time?: unknown }).time);
    if (!Number.isFinite(tm)) continue;
    const tx = String((m as { text?: string }).text ?? '');
    const { long: lg, short: sh } = classifyInstitutionalBandMarkerText(tx);
    if (!lg && !sh) continue;
    if (tm === lastBarOpen) {
      if (lg) out.lastBar.long = true;
      if (sh) out.lastBar.short = true;
    }
    if (prevT !== null && tm === prevT) {
      if (lg) out.prevBar.long = true;
      if (sh) out.prevBar.short = true;
    }
  }
  return out;
}

/** 현재 차트 TF 행: digest 계산 후 차트에 실제로 보이는 로켓으로 덮어 단일화 */
export function applyChartDisplayedRocketsToMtfDigest(
  board: MtfSignalBoardDigest,
  displayed: MtfDisplayedRocketLastPrev | null,
): MtfSignalBoardDigest {
  if (!displayed) return board;
  const anyDisp =
    displayed.lastBar.long ||
    displayed.lastBar.short ||
    displayed.prevBar.long ||
    displayed.prevBar.short;
  return {
    ...board,
    rocket: board.rocket || anyDisp,
    lastBar: {
      ...board.lastBar,
      rocket: displayed.lastBar.long || displayed.lastBar.short,
      rocketLong: displayed.lastBar.long,
      rocketShort: displayed.lastBar.short,
    },
    prevBar: {
      ...board.prevBar,
      rocket: displayed.prevBar.long || displayed.prevBar.short,
      rocketLong: displayed.prevBar.long,
      rocketShort: displayed.prevBar.short,
    },
  };
}

/** 현재 차트 TF 행: digest 후 차트에 실제로 그려진 기관 밴드 터치로 last/prev `band*` 단일화 */
/**
 * MTF 카드 한 행의 last/prev 바 — ChartView MTF 표(`b != null ? b.lastBar : sticky?.lastBar`)와 동일.
 */
export function mtfCardRowLastPrevBarsForTelegram(
  row: { board?: MtfSignalBoardDigest } | undefined,
  sticky: MtfSignalBoardDigest | undefined,
): { lastBar: MtfBarFlags; prevBar: MtfBarFlags } {
  const b = row?.board;
  const lastBar = b != null ? b.lastBar : sticky?.lastBar ?? emptyFlags();
  const prevBar = b != null ? b.prevBar : sticky?.prevBar ?? emptyFlags();
  return { lastBar, prevBar };
}

/**
 * 마감안착 MTF 자동 텔레: 구조 로켓/밴드 L·S(현·전) 또는 마감존 ⟡ 롱/숏 참고(현·전).
 */
export function monthDeskMtfTelegramTriggerHot(lastBar: MtfBarFlags, prevBar: MtfBarFlags): boolean {
  const digest: MtfSignalBoardDigest = {
    rocket: lastBar.rocket || prevBar.rocket,
    delta: lastBar.deltaYang || lastBar.deltaEum || prevBar.deltaYang || prevBar.deltaEum,
    jangEum: lastBar.jangEum || prevBar.jangEum,
    band: lastBar.band || prevBar.band,
    lh: lastBar.lh || prevBar.lh,
    lastBar,
    prevBar,
  };
  if (mtfBoardDigestRocketBandLastPrevHot(digest)) return true;
  return !!(
    lastBar.closingLong ||
    lastBar.closingShort ||
    prevBar.closingLong ||
    prevBar.closingShort
  );
}

export function applyChartDisplayedBandsToMtfDigest(
  board: MtfSignalBoardDigest,
  displayed: MtfDisplayedBandLastPrev | null,
): MtfSignalBoardDigest {
  if (!displayed) return board;
  const anyDisp =
    displayed.lastBar.long ||
    displayed.lastBar.short ||
    displayed.prevBar.long ||
    displayed.prevBar.short;
  const lastBand = displayed.lastBar.long || displayed.lastBar.short;
  const prevBand = displayed.prevBar.long || displayed.prevBar.short;
  return {
    ...board,
    band: board.band || anyDisp,
    lastBar: {
      ...board.lastBar,
      band: lastBand,
      bandLong: displayed.lastBar.long,
      bandShort: displayed.lastBar.short,
    },
    prevBar: {
      ...board.prevBar,
      band: prevBand,
      bandLong: displayed.prevBar.long,
      bandShort: displayed.prevBar.short,
    },
  };
}

export const MTF_SIGNAL_BOARD_TFS = ['1m', '3m', '5m', '15m', '1h', '4h', '1d', '1w', '1M'] as const;
