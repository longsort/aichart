import type { MtfSignalBoardDigest } from '@/lib/mtfSignalBoardDigest';

/**
 * 심볼별 저장용 — **최신 한 번의 digest만** 유지 (구버전 OR 누적은 없던 신호가 계속 켜져 보이는 원인).
 * 행이 아직 없을 때 카드가 비지 않도록 마지막 성공 응답만 스냅샷으로 둔다.
 */
export function accumulateMtfSignalBoardSticky(
  _prev: MtfSignalBoardDigest | undefined,
  live: MtfSignalBoardDigest,
): MtfSignalBoardDigest {
  return {
    rocket: live.rocket,
    delta: live.delta,
    jangEum: live.jangEum,
    band: live.band,
    lh: live.lh,
    lastBar: { ...live.lastBar },
    prevBar: { ...live.prevBar },
  };
}
