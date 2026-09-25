/**
 * 폰·태블릿 vs PC 레이아웃 분기.
 * Chrome「데스크톱 사이트」·가로 모드도 터치+너비로 폰 레이아웃 적용.
 */
export function isMobileLikeViewport(): boolean {
  if (typeof window === 'undefined') return false;
  const w = window.innerWidth;
  if (w <= 960) return true;
  const touch =
    'ontouchstart' in window ||
    (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0) ||
    window.matchMedia('(pointer: coarse)').matches;
  if (touch && w <= 1280) return true;
  return window.matchMedia('(hover: none) and (pointer: coarse)').matches;
}
