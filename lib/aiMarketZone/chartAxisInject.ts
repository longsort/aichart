/**
 * AI존 차트 라벨 — 면 우측 알약 대신 **가격축 createPriceLine** 주입.
 * 한글·실데이터만. 확정 승률 문구 금지.
 */
import type { AtlasPulsePriceLine } from '@/lib/monthDeskAtlasPulseDesk';
import type { AmzMarketZone } from './types';
import { isAmzApproachState } from './explainEngine';

function pct(v: number | null | undefined): string | null {
  if (v == null || !Number.isFinite(v)) return null;
  return `${Math.round(v * 100)}%`;
}

function strengthPrefix(z: AmzMarketZone): string {
  if (z.currentStrength >= 75) return '강한';
  if (z.currentStrength >= 55) return '';
  return '약한';
}

function roleShort(z: AmzMarketZone): string {
  return z.roleKo.replace(/^강한\s+/, '').replace(/^약한\s+/, '');
}

export function amzZoneAxisTitle(z: AmzMarketZone): string {
  const s = strengthPrefix(z);
  const role = roleShort(z);
  const base = s ? `AI${s}${role}` : `AI${role}`;
  if (z.probabilities.calibrated) {
    const h = pct(z.probabilities.hold);
    if (h) return `${base} 유지${h}`;
  }
  return `${base} ${z.stateKo}`;
}

/**
 * Zone 네모는 면만 · 정보는 가격축 라벨로 주입 (목업 알약과 다른 방식).
 */
export function amzZonesToAxisPriceLines(zones: AmzMarketZone[]): AtlasPulsePriceLine[] {
  const lines: AtlasPulsePriceLine[] = [];
  const used: number[] = [];
  const near = (p: number) => used.some((u) => Math.abs(u - p) / Math.max(p, 1) < 0.0004);

  for (const z of zones) {
    const resist =
      z.role === 'DEFENSE_RESISTANCE' || z.role === 'LIQUIDITY_TRAP';
    const color =
      z.role === 'MAGNET'
        ? '#3b82f6'
        : resist
          ? '#f472b6'
          : '#34d399';
    const mid = (z.outerLower + z.outerUpper) / 2;
    const title = amzZoneAxisTitle(z);
    const push = (price: number, label: string, style: AtlasPulsePriceLine['lineStyle']) => {
      if (!(price > 0) || near(price)) return;
      used.push(price);
      lines.push({
        price,
        color,
        title: label,
        lineWidth: 1,
        lineStyle: style,
        axisLabel: true,
      });
    };
    push(mid, title, 'solid');
    if (z.coreDefensePrice != null && isAmzApproachState(z.state)) {
      push(z.coreDefensePrice, `AI방어 ${z.coreDefensePrice.toFixed(0)}`, 'dashed');
    }
    if (z.criticalEdge != null && isAmzApproachState(z.state)) {
      push(z.criticalEdge, `AI취약 ${z.criticalEdge.toFixed(0)}`, 'dotted');
    }
  }
  return lines.slice(0, 14);
}

/** 사이드카드용 — 차트에 주입된 축 라벨 목록 */
export function amzAxisInjectListKo(zones: AmzMarketZone[]): string[] {
  return amzZonesToAxisPriceLines(zones).map((l) => `${l.title} @ ${l.price.toFixed(0)}`);
}
