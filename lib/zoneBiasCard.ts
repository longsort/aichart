/**
 * 기준 가격: 가장 가까운 지지/저항 OB + 엔진 verdict·무효가.
 * "이 구간 롱/숏" 카드 — 확정엔진(5게이트)과 별개 보조.
 */

function fmtP(p: number): string {
  if (!Number.isFinite(p) || p <= 0) return '–';
  if (p >= 1) return p.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return p.toLocaleString(undefined, { maximumFractionDigits: 6 });
}

export type ZoneBiasCard = {
  low: number;
  high: number;
  side: 'LONG' | 'SHORT' | null;
  confidence: number;
  invalidateAbove: number | null;
  invalidateBelow: number | null;
  summaryLines: string[];
};

type ObZone = { low: number; high: number; probability?: number; pastTouches?: number; pastHits?: number } | null | undefined;
type Lvl = { price: number; reason?: string } | null | undefined;

function distToOb(px: number, z: { low: number; high: number }): number {
  const lo = z.low;
  const hi = z.high;
  const mid = (lo + hi) / 2;
  if (px >= lo && px <= hi) return 0;
  return Math.min(Math.abs(px - lo), Math.abs(px - hi), Math.abs(px - mid));
}

/**
 * @returns null = OB/판정이 비어 있어 설명할 구간이 없을 때
 */
export function buildZoneBiasCard(input: {
  currentPrice: number;
  verdict: 'LONG' | 'SHORT' | 'WATCH';
  nearestSupportOb: ObZone;
  nearestResistanceOb: ObZone;
  supportLevel: Lvl;
  resistanceLevel: Lvl;
  invalidationLevel: Lvl;
}): ZoneBiasCard | null {
  const { currentPrice, verdict, nearestSupportOb, nearestResistanceOb, supportLevel, resistanceLevel, invalidationLevel } = input;
  if (!Number.isFinite(currentPrice) || currentPrice <= 0) return null;

  const dSup = nearestSupportOb
    ? distToOb(currentPrice, nearestSupportOb) / currentPrice
    : Infinity;
  const dRes = nearestResistanceOb
    ? distToOb(currentPrice, nearestResistanceOb) / currentPrice
    : Infinity;

  if (!nearestSupportOb && !nearestResistanceOb) return null;

  let side: 'LONG' | 'SHORT' | null = null;
  let low = 0;
  let high = 0;
  const lines: string[] = [];

  const pickByVerdict = () => {
    if (verdict === 'LONG' && nearestSupportOb) {
      side = 'LONG';
      low = nearestSupportOb.low;
      high = nearestSupportOb.high;
      const p = nearestSupportOb.probability ?? 55;
      const touch = (nearestSupportOb as { pastHits?: number }).pastHits;
      lines.push(
        `지지 OB ${fmtP(low)}~${fmtP(high)} (참고 확률·터치 ${p}%${typeof touch === 'number' ? `, 과거 ${touch}회` : ''})`
      );
      return true;
    }
    if (verdict === 'SHORT' && nearestResistanceOb) {
      side = 'SHORT';
      low = nearestResistanceOb.low;
      high = nearestResistanceOb.high;
      const p = nearestResistanceOb.probability ?? 55;
      const touch = (nearestResistanceOb as { pastHits?: number }).pastHits;
      lines.push(
        `저항 OB ${fmtP(low)}~${fmtP(high)} (참고 확률·터치 ${p}%${typeof touch === 'number' ? `, 과거 ${touch}회` : ''})`
      );
      return true;
    }
    return false;
  };

  if (!pickByVerdict()) {
    if (dSup < 0.008 && nearestSupportOb && dSup <= dRes) {
      side = 'LONG';
      low = nearestSupportOb!.low;
      high = nearestSupportOb!.high;
      lines.push(`가격이 지지 OB ${fmtP(low)}~${fmtP(high)}에 가장 근접 (관망/혼조 시에도 이 구간 관찰)`);
    } else if (dRes < 0.008 && nearestResistanceOb) {
      side = 'SHORT';
      low = nearestResistanceOb!.low;
      high = nearestResistanceOb!.high;
      lines.push(`가격이 저항 OB ${fmtP(low)}~${fmtP(high)}에 가장 근접`);
    } else if (dSup < dRes && nearestSupportOb) {
      side = 'LONG';
      low = nearestSupportOb.low;
      high = nearestSupportOb.high;
      lines.push(`유효한 지지 OB: ${fmtP(low)}~${fmtP(high)} (현재가·판정에 따라 강도 변동)`);
    } else if (nearestResistanceOb) {
      side = 'SHORT';
      low = nearestResistanceOb!.low;
      high = nearestResistanceOb!.high;
      lines.push(`유효한 저항 OB: ${fmtP(low)}~${fmtP(high)}`);
    } else {
      return null;
    }
  }

  const pBase = side === 'LONG' ? nearestSupportOb?.probability : nearestResistanceOb?.probability;
  const baseProb = pBase != null && Number.isFinite(pBase) ? pBase : 50;
  const distBonus = (side === 'LONG' && nearestSupportOb ? 1 - Math.min(1, dSup * 200) : side === 'SHORT' && nearestResistanceOb ? 1 - Math.min(1, dRes * 200) : 0.5) * 12;
  const confidence = Math.min(95, Math.max(28, Math.round(32 + baseProb * 0.4 + distBonus)));

  const invalidateBelow =
    side === 'LONG'
      ? (invalidationLevel?.price ?? supportLevel?.price ?? low * 0.9995) ?? null
      : (invalidationLevel?.price ?? (nearestSupportOb ? nearestSupportOb.low : null) ?? null);

  const invalidateAbove =
    side === 'SHORT'
      ? (invalidationLevel?.price ?? resistanceLevel?.price ?? high * 1.0005) ?? null
      : (invalidationLevel?.price ?? (nearestResistanceOb ? nearestResistanceOb.high : null) ?? null);

  if (side === 'LONG' && invalidateBelow != null) {
    lines.push(`롱·지지 약화 참고: ${fmtP(invalidateBelow)} 이하(근처)로 마감/확인 시`);
  } else if (side === 'SHORT' && invalidateAbove != null) {
    lines.push(`숏·저항 약화 참고: ${fmtP(invalidateAbove)} 이상(근처)로 마감/확인 시`);
  }

  if (verdict === 'WATCH' && side) {
    lines.push('종합은 관망이어도, 위 박스는 “우선 감시 구간”입니다. (수급·체결·5요소와 함께 보면 가독성 ↑)');
  }

  return { low, high, side, confidence, invalidateAbove, invalidateBelow, summaryLines: lines };
}
