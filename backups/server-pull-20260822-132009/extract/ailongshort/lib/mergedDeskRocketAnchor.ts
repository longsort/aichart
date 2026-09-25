/**
 * 구조 로켓 앵커 — LWC belowBar/aboveBar · SMC BOS/CHOCH와 동일.
 * 롱 🚀: 봉 저가 아래(아래에서 위로 발사)
 * 숏 📉: 봉 고가 위(위에서 아래로 하락)
 */

export type RocketDir = 'LONG' | 'SHORT';

export function mergedDeskRocketAnchorPrice(
  bar: { high: number; low: number },
  direction: RocketDir
): number {
  return direction === 'LONG' ? Number(bar.low) : Number(bar.high);
}

/** 화면 Y(아래가 +). 줌·로켓 크기와 같이 벌려 심지가 아이콘을 먹지 않게. */
export function mergedDeskRocketScreenYOffset(
  direction: RocketDir,
  scale = 1
): number {
  const pad = Math.max(10, Math.round(12 * Math.max(0.35, Math.min(2.2, scale))));
  return direction === 'LONG' ? pad : -pad;
}

export function mergedDeskRocketTransformOrigin(direction: RocketDir): string {
  return direction === 'LONG' ? '50% 0%' : '50% 100%';
}

/**
 * 봉 몸통·거래량으로 방향만 보강(뒤집지 않음).
 * 강한 반대 종가+거래량이면 null → 호출측에서 스킵 가능.
 */
export function mergedDeskRocketBarSupportsDirection(
  bar: { open: number; high: number; low: number; close: number; volume?: number },
  direction: RocketDir,
  volMed?: number
): boolean {
  const o = Number(bar.open);
  const c = Number(bar.close);
  const h = Number(bar.high);
  const l = Number(bar.low);
  const range = h - l;
  if (!(range > 0) || !Number.isFinite(c) || !Number.isFinite(o)) return true;
  const body = Math.abs(c - o);
  const closePos = (c - l) / range;
  const vol = Number(bar.volume);
  const volOk = !(volMed != null && volMed > 0 && Number.isFinite(vol)) || vol >= volMed * 0.55;
  if (direction === 'LONG') {
    if (c < o && closePos < 0.22 && body / range > 0.55 && volOk) return false;
    return true;
  }
  if (c > o && closePos > 0.78 && body / range > 0.55 && volOk) return false;
  return true;
}
