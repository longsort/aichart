/**
 * 모바일 차트 — pinch/pan 직후 LWC subscribeClick이 AVWAP·설명카드로 오작동하는 것 방지.
 * 더블탭으로만 설명카드 열기 · pinch 시작 시 카드 닫기(콜백) 지원.
 */
export type ChartTouchClickGuard = {
  onTouchStart: (e: TouchEvent) => void;
  onTouchMove: (e: TouchEvent) => void;
  onTouchEnd: () => void;
  onTouchCancel: () => void;
  /** pinch·드래그·제스처 직후 — chart click(설명카드) 무시 */
  shouldSuppressChartClick: () => boolean;
  /** 모바일 — 동일 키 2번째 탭이면 true(카드 열기), 1번째는 false */
  consumeDoubleTap: (key: string) => boolean;
  dispose: () => void;
};

export function createChartTouchClickGuard(opts?: {
  tapSlopPx?: number;
  postGestureMs?: number;
  doubleTapMs?: number;
  onPinchStart?: () => void;
}): ChartTouchClickGuard {
  const tapSlopPx = opts?.tapSlopPx ?? 14;
  const postGestureMs = opts?.postGestureMs ?? 520;
  const doubleTapMs = opts?.doubleTapMs ?? 420;

  let active = false;
  let pinch = false;
  let moved = false;
  let startX = 0;
  let startY = 0;
  let suppressUntil = 0;
  let lastTapKey = '';
  let lastTapAt = 0;

  const resetDoubleTap = () => {
    lastTapKey = '';
    lastTapAt = 0;
  };

  const markGesture = () => {
    suppressUntil = Date.now() + postGestureMs;
    resetDoubleTap();
  };

  const enterPinch = () => {
    if (!pinch) opts?.onPinchStart?.();
    pinch = true;
    markGesture();
  };

  return {
    onTouchStart: (e) => {
      active = true;
      moved = false;
      pinch = e.touches.length >= 2;
      const t = e.touches[0];
      if (t) {
        startX = t.clientX;
        startY = t.clientY;
      }
      if (pinch) enterPinch();
    },
    onTouchMove: (e) => {
      if (!active) return;
      if (e.touches.length >= 2) {
        enterPinch();
        return;
      }
      const t = e.touches[0];
      if (!t) return;
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;
      if (Math.hypot(dx, dy) >= tapSlopPx) {
        moved = true;
        markGesture();
      }
    },
    onTouchEnd: () => {
      if (pinch || moved) markGesture();
      active = false;
      pinch = false;
      moved = false;
    },
    onTouchCancel: () => {
      if (pinch || moved) markGesture();
      active = false;
      pinch = false;
      moved = false;
    },
    shouldSuppressChartClick: () =>
      active || pinch || moved || Date.now() < suppressUntil,
    consumeDoubleTap: (key: string) => {
      const now = Date.now();
      if (lastTapKey === key && now - lastTapAt <= doubleTapMs) {
        resetDoubleTap();
        return true;
      }
      lastTapKey = key;
      lastTapAt = now;
      return false;
    },
    dispose: () => {
      active = false;
      pinch = false;
      moved = false;
      suppressUntil = 0;
      resetDoubleTap();
    },
  };
}

/** AVWAP 설명카드 — 터치 UI는 스냅 허용폭을 더 좁게 */
export function avwapExplainSnapTolerance(mergedTouchUi: boolean): {
  pickTolRatio: number;
  strictHitRatio: number;
} {
  return mergedTouchUi
    ? { pickTolRatio: 0.001, strictHitRatio: 0.00045 }
    : { pickTolRatio: 0.0045, strictHitRatio: 0.0022 };
}

/** 모바일 설명카드 — 더블탭 필요 여부 판단 */
export function shouldOpenFeatureExplainCardOnTouch(
  mergedTouchUi: boolean,
  guard: ChartTouchClickGuard | null | undefined,
  tapKey: string
): boolean {
  if (!mergedTouchUi) return true;
  return guard?.consumeDoubleTap(tapKey) === true;
}
