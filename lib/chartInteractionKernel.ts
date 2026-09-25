/**
 * 차트 인터랙션 아키텍처 커널
 *
 * 목표: Binance / Bitget / TradingView 모바일처럼
 * pan·pinch 중에는 LWC viewport(캔들)만 움직이고,
 * HTML overlay·분석·zone·지표 재계산은 입력이 끝난 뒤에만 한 프레임 맞춘다.
 *
 * ChartView의 canvas(static candles) / dynamic tip / overlay HTML 분리 조율.
 */

export type ChartInteractionKind = 'pan' | 'pinch' | 'wheel' | 'axis' | 'program';

export type ChartCoordCacheKey = string;

export type ChartVisibleGeomCache = {
  logicalFrom: number;
  logicalTo: number;
  barSpacing: number;
  priceFrom: number;
  priceTo: number;
  width: number;
  height: number;
  capturedAt: number;
};

export type ChartInteractionKernel = {
  /** pan/zoom 중 — overlay/analysis 재계산 금지 */
  isBusy: () => boolean;
  /** 분석 엔진이 UI 프레임을 막으면 안 되는 구간 */
  shouldDeferAnalysis: () => boolean;
  begin: (kind?: ChartInteractionKind) => void;
  /** 포인터 업 직후 짧은 settle — kinetic 관성 포함 */
  end: (settleMs?: number) => void;
  /** busy 중이면 queue만, idle면 rAF 1회 실행 */
  scheduleOverlayRefresh: (run: () => void) => void;
  /** 대기 중인 overlay flush */
  flushOverlayIfIdle: (run: () => void) => void;
  /** pan 시작 시 앵커 — overlay CSS transform용 */
  capturePanAnchor: (logicalFrom: number, barSpacing: number) => void;
  /** 현재 논리 from → 픽셀 dx (캔들 폭 캐시 사용) */
  panOverlayDx: (logicalFrom: number) => number;
  clearPanAnchor: () => void;
  getBarSpacing: () => number;
  setBarSpacing: (n: number) => void;
  /** time/price → screen 캐시 (geometry 시그니처 단위) */
  getCoord: (key: ChartCoordCacheKey, compute: () => number | null) => number | null;
  invalidateCoordCache: (geomSig?: string) => void;
  setGeomSig: (sig: string) => void;
  getGeomSig: () => string;
  saveVisibleGeom: (g: ChartVisibleGeomCache) => void;
  getVisibleGeom: () => ChartVisibleGeomCache | null;
  /** 실시간 tip만 바뀌었는지 — 전체 setData 스킵 판단 */
  isTipOnlyChange: (
    prev: { len: number; firstT: number; lastT: number } | null,
    next: { len: number; firstT: number; lastT: number }
  ) => boolean;
  /** 마지막 봉 OHLC 또는 봉 1개 append — setData 없이 update */
  isLiveTailChange: (
    prev: { len: number; firstT: number; lastT: number } | null,
    next: { len: number; firstT: number; lastT: number }
  ) => boolean;
  dispose: () => void;
};

const DEFAULT_SETTLE_MS = 140;

export function createChartInteractionKernel(): ChartInteractionKernel {
  let busy = false;
  let settleTimer: ReturnType<typeof setTimeout> | null = null;
  let overlayQueued = false;
  let overlayRaf: number | null = null;
  let lastOverlayRun: (() => void) | null = null;
  let panLogicalFrom: number | null = null;
  let panBarSpacing = 7;
  let barSpacing = 7;
  let geomSig = '';
  let coordCache = new Map<string, number | null>();
  let visibleGeom: ChartVisibleGeomCache | null = null;
  let lastKind: ChartInteractionKind = 'pan';

  const clearSettle = () => {
    if (settleTimer != null) {
      clearTimeout(settleTimer);
      settleTimer = null;
    }
  };

  const runOverlayOnce = (run: () => void) => {
    if (overlayRaf != null) return;
    overlayRaf = requestAnimationFrame(() => {
      overlayRaf = null;
      overlayQueued = false;
      run();
    });
  };

  return {
    isBusy: () => busy,
    shouldDeferAnalysis: () => busy,
    begin: (kind = 'pan') => {
      lastKind = kind;
      clearSettle();
      busy = true;
    },
    end: (settleMs = DEFAULT_SETTLE_MS) => {
      clearSettle();
      /** pinch/wheel은 조금 더 길게 — kinetic 종료 후 1회 동기화 */
      const ms =
        lastKind === 'pinch' || lastKind === 'wheel'
          ? Math.max(settleMs, 180)
          : settleMs;
      settleTimer = setTimeout(() => {
        settleTimer = null;
        busy = false;
        panLogicalFrom = null;
        if (overlayQueued && lastOverlayRun) {
          overlayQueued = false;
          runOverlayOnce(lastOverlayRun);
        }
      }, ms);
    },
    scheduleOverlayRefresh: (run) => {
      lastOverlayRun = run;
      if (busy) {
        overlayQueued = true;
        return;
      }
      runOverlayOnce(run);
    },
    flushOverlayIfIdle: (run) => {
      lastOverlayRun = run;
      if (busy) {
        overlayQueued = true;
        return;
      }
      if (!overlayQueued && overlayRaf == null) {
        runOverlayOnce(run);
        return;
      }
      if (overlayQueued) runOverlayOnce(run);
    },
    capturePanAnchor: (logicalFrom, spacing) => {
      if (Number.isFinite(logicalFrom)) panLogicalFrom = logicalFrom;
      if (spacing > 0) {
        panBarSpacing = spacing;
        barSpacing = spacing;
      }
    },
    panOverlayDx: (logicalFrom) => {
      if (panLogicalFrom == null || !Number.isFinite(logicalFrom)) return 0;
      const spacing = panBarSpacing > 0 ? panBarSpacing : barSpacing;
      /** 논리 from이 커지면 과거로 → 캔들은 왼쪽, 오버레이는 같이 왼쪽으로 */
      return (panLogicalFrom - logicalFrom) * spacing;
    },
    clearPanAnchor: () => {
      panLogicalFrom = null;
    },
    getBarSpacing: () => barSpacing,
    setBarSpacing: (n) => {
      if (n > 0 && Number.isFinite(n)) barSpacing = n;
    },
    getCoord: (key, compute) => {
      if (coordCache.has(key)) return coordCache.get(key) ?? null;
      const v = compute();
      coordCache.set(key, v);
      return v;
    },
    invalidateCoordCache: (sig) => {
      if (sig != null && sig === geomSig && coordCache.size) return;
      coordCache = new Map();
      if (sig != null) geomSig = sig;
    },
    setGeomSig: (sig) => {
      if (sig === geomSig) return;
      geomSig = sig;
      coordCache = new Map();
    },
    getGeomSig: () => geomSig,
    saveVisibleGeom: (g) => {
      visibleGeom = g;
      if (g.barSpacing > 0) barSpacing = g.barSpacing;
    },
    getVisibleGeom: () => visibleGeom,
    isTipOnlyChange: (prev, next) => {
      if (!prev) return false;
      return (
        prev.len === next.len &&
        prev.firstT === next.firstT &&
        prev.lastT === next.lastT &&
        next.len > 0
      );
    },
    isLiveTailChange: (prev, next) => {
      if (!prev || !(next.len > 0)) return false;
      /** 미완료 봉 OHLC — firstT가 sanitize로 흔들려도 setData 금지 */
      if (prev.lastT === next.lastT) return true;
      /** 새 봉 append (캡 슬라이스면 길이는 같고 lastT만 증가) */
      if (next.lastT > prev.lastT && (next.len === prev.len || next.len === prev.len + 1)) return true;
      return false;
    },
    dispose: () => {
      clearSettle();
      if (overlayRaf != null) cancelAnimationFrame(overlayRaf);
      overlayRaf = null;
      busy = false;
      overlayQueued = false;
      lastOverlayRun = null;
      coordCache = new Map();
      visibleGeom = null;
    },
  };
}

/** 화면 밖 논리 인덱스 culling — HTML zone 행 스킵용 */
export function isLogicalIndexInView(
  idx: number,
  from: number,
  to: number,
  padBars = 2
): boolean {
  if (!Number.isFinite(idx) || !Number.isFinite(from) || !Number.isFinite(to)) return true;
  const lo = Math.min(from, to) - padBars;
  const hi = Math.max(from, to) + padBars;
  return idx >= lo && idx <= hi;
}

/** tip OHLC만 series.update 가능한지 — 스파클은 tip 동일 OHLC의 setData 경로에서만 처리 */
export function canTipUpdateWithoutFullSetData(params: {
  interacting: boolean;
  tipOnly: boolean;
  sparkleActive: boolean;
}): boolean {
  /** 라이브 봉 OHLC 갱신은 스파클과 무관하게 update — setData 루프(우측 밀림) 방지 */
  if (params.tipOnly) return true;
  if (params.sparkleActive) return false;
  return params.interacting;
}
