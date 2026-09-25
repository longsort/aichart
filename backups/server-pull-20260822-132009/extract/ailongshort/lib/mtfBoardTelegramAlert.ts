import { createHash } from 'crypto';
import { mtfBoardDigestRocketBandLastPrevHot, type MtfSignalBoardDigest } from '@/lib/mtfSignalBoardDigest';

/** MTF 카드에서 「현」또는 「전」에 구조 로켓·밴드 롱/숏이 있는 행이 있는지(앱과 동일 기준) */
export function mtfBoardHasCurrentOrPrevHot(rows: Array<{ digest: MtfSignalBoardDigest }>): boolean {
  return rows.some((r) => mtfBoardDigestRocketBandLastPrevHot(r.digest));
}

/** 동일 보드 상태 재전송 방지용 짧은 지문 */
export function mtfBoardFingerprint(
  rows: Array<{ tf: string; digest: MtfSignalBoardDigest }>
): string {
  const payload = rows.map((r) => ({
    tf: r.tf,
    last: r.digest.lastBar,
    prev: r.digest.prevBar,
  }));
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex').slice(0, 22);
}
