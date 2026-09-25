/**
 * 차트 휠 → TradingView식 확대·축소 (커서 아래 고정).
 * X: visibleLogicalRange만 커서 앵커로 변경 (barSpacing apply 금지 → 우측 스냅 원인).
 * Y: 가격 가시구간을 동일 배율·커서 가격 기준.
 */
import type { IChartApi, ISeriesApi } from 'lightweight-charts';

export const CHART_BAR_SPACING_MIN = 2;
export const CHART_BAR_SPACING_MAX = 48;

/** 한 틱 휠 delta를 안전하게 클램프·정규화 */
export function normalizeWheelDeltaY(ev: WheelEvent, hostHeightPx: number): number {
  let dy = Number(ev.deltaY) || 0;
  if (ev.deltaMode === 1) dy *= 16;
  if (ev.deltaMode === 2) dy *= Math.max(120, hostHeightPx || 400);
  const vv =
    typeof window !== 'undefined' && window.visualViewport
      ? Number(window.visualViewport.scale) || 1
      : 1;
  dy /= Math.max(0.55, Math.min(3, vv));
  const dpr =
    typeof window !== 'undefined' ? Math.max(1, Math.min(3, window.devicePixelRatio || 1)) : 1;
  if (dpr > 1.25) dy /= Math.min(1.35, dpr * 0.85);
  return Math.max(-120, Math.min(120, dy));
}

export type SmoothWheelZoomOpts = {
  intensity?: number;
  min?: number;
  max?: number;
  candleSeries?: ISeriesApi<'Candlestick'> | null;
};

function resolveWheelAnchorLogical(
  ts: ReturnType<IChartApi['timeScale']>,
  cursorX: number
): number | null {
  try {
    const L = ts.coordinateToLogical(cursorX);
    if (L != null && Number.isFinite(Number(L))) return Number(L);
  } catch {
    /* ignore */
  }
  try {
    const lr = ts.getVisibleLogicalRange();
    if (lr && Number.isFinite(lr.from) && Number.isFinite(lr.to) && lr.to > lr.from) {
      return (lr.from + lr.to) / 2;
    }
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * 논리 가시구간만 커서 기준으로 확대·축소.
 * barSpacing applyOptions 하지 않음 — LWC가 폭에 맞게 spacing을 맞춤.
 */
function applyLogicalZoomAtCursor(
  ts: ReturnType<IChartApi['timeScale']>,
  cursorX: number,
  anchorLogical: number,
  factor: number
): boolean {
  let lr: { from: number; to: number } | null = null;
  try {
    lr = ts.getVisibleLogicalRange();
  } catch {
    lr = null;
  }
  if (!lr || !(lr.to > lr.from) || !(factor > 0) || !Number.isFinite(factor)) return false;

  const span = lr.to - lr.from;
  const rel = Math.max(0, Math.min(1, (anchorLogical - lr.from) / span));
  const newSpan = Math.max(3, Math.min(800, span / factor));
  let newFrom = anchorLogical - rel * newSpan;
  let newTo = newFrom + newSpan;

  try {
    /** 줌 중 우측 고정 옵션 끄기 */
    ts.applyOptions({ rightBarStaysOnScroll: false });
    ts.setVisibleLogicalRange({ from: newFrom, to: newTo });
  } catch {
    return false;
  }

  /** 커서 논리값이 같은 X에 남도록 1회 드리프트 보정 */
  try {
    const after = ts.coordinateToLogical(cursorX);
    if (after != null && Number.isFinite(Number(after))) {
      const drift = Number(after) - anchorLogical;
      if (Math.abs(drift) > 0.01) {
        const lr2 = ts.getVisibleLogicalRange();
        if (lr2 && lr2.to > lr2.from) {
          ts.setVisibleLogicalRange({
            from: lr2.from - drift,
            to: lr2.to - drift,
          });
        }
      }
    }
  } catch {
    /* ignore */
  }
  return true;
}

/**
 * X: 커서 기준 logical zoom.
 * Y: 커서 가격 기준 동일 factor.
 * 반환: 적용 후 barSpacing (persist용) 또는 null.
 */
export function applySmoothCandleWheelZoom(
  chart: IChartApi,
  hostEl: HTMLElement,
  ev: WheelEvent,
  opts?: SmoothWheelZoomOpts
): number | null {
  const intensity = opts?.intensity ?? 0.00145;
  const series = opts?.candleSeries ?? null;
  const rect = hostEl.getBoundingClientRect();
  if (!(rect.width > 8) || !(rect.height > 8)) return null;

  const dy = normalizeWheelDeltaY(ev, rect.height);
  if (Math.abs(dy) < 0.01) return null;

  const factor = Math.exp(-dy * intensity);
  if (!(factor > 0) || !Number.isFinite(factor) || Math.abs(factor - 1) < 0.004) return null;

  const ts = chart.timeScale();
  let spacingBefore = 7;
  try {
    const o = ts.options?.() as { barSpacing?: number } | undefined;
    const s = Number(o?.barSpacing);
    if (s > 0 && Number.isFinite(s)) spacingBefore = s;
  } catch {
    /* keep */
  }

  const x = ev.clientX - rect.left;
  const y = ev.clientY - rect.top;

  let priceAnchor: number | null = null;
  let prBefore: { from: number; to: number } | null = null;
  if (series) {
    try {
      const p = series.coordinateToPrice(y);
      const n = typeof p === 'number' ? p : Number(p);
      if (Number.isFinite(n)) priceAnchor = n;
      const pr = series.priceScale().getVisibleRange();
      if (pr && Number.isFinite(pr.from) && Number.isFinite(pr.to) && pr.to > pr.from) {
        prBefore = { from: pr.from, to: pr.to };
      }
    } catch {
      priceAnchor = null;
      prBefore = null;
    }
  }

  const canZoomY = Boolean(series && prBefore && priceAnchor != null);
  const anchorLogical = resolveWheelAnchorLogical(ts, x);
  if (anchorLogical == null && !canZoomY) return null;

  if (anchorLogical != null) {
    if (!applyLogicalZoomAtCursor(ts, x, anchorLogical, factor)) {
      if (!canZoomY) return null;
    }
  }

  if (canZoomY && prBefore && priceAnchor != null) {
    try {
      const ps = series!.priceScale();
      ps.applyOptions({ autoScale: false });
      const newFrom = priceAnchor - (priceAnchor - prBefore.from) / factor;
      const newTo = priceAnchor + (prBefore.to - priceAnchor) / factor;
      if (
        Number.isFinite(newFrom) &&
        Number.isFinite(newTo) &&
        newTo > newFrom &&
        (newTo - newFrom) / Math.max(1e-12, Math.abs(priceAnchor)) > 1e-8
      ) {
        ps.setVisibleRange({ from: newFrom, to: newTo });
      }
    } catch {
      /* ignore */
    }
  }

  try {
    const o = ts.options?.() as { barSpacing?: number } | undefined;
    const s = Number(o?.barSpacing);
    if (s > 0 && Number.isFinite(s)) {
      return Math.max(
        opts?.min ?? CHART_BAR_SPACING_MIN,
        Math.min(opts?.max ?? CHART_BAR_SPACING_MAX, s)
      );
    }
  } catch {
    /* ignore */
  }
  return spacingBefore;
}
