/**
 * AI Market Zone → OverlayItem + 가격축 라벨 주입.
 * 면 우측 알약/콜아웃 금지 — zone 네모 + createPriceLine 축 라벨(한글·실데이터).
 */
import type { Candle, OverlayItem } from '@/types';
import type { AtlasPulsePriceLine } from '@/lib/monthDeskAtlasPulseDesk';
import { mergedDeskAnalyzedZoneSpanTimes } from '@/lib/mergedAnalysisOverlayTimes';
import type { AmzMarketZone } from './types';
import {
  buildAmzFeatureExplainKo,
  buildAmzZoneDetailKo,
  isAmzApproachState,
} from './explainEngine';
import { amzZonesToAxisPriceLines } from './chartAxisInject';

function roleColor(role: AmzMarketZone['role']): {
  stroke: string;
  fill: string;
  core: string;
  resist: boolean;
} {
  switch (role) {
    case 'DEFENSE_SUPPORT':
    case 'FLIP':
      return {
        stroke: '#22c55e',
        fill: 'rgba(34,197,94,0.38)',
        core: 'rgba(16,185,129,0.48)',
        resist: false,
      };
    case 'DEFENSE_RESISTANCE':
      return {
        stroke: '#ef4444',
        fill: 'rgba(239,68,68,0.38)',
        core: 'rgba(220,38,38,0.48)',
        resist: true,
      };
    case 'MAGNET':
      return {
        stroke: '#3b82f6',
        fill: 'rgba(59,130,246,0.28)',
        core: 'rgba(37,99,235,0.36)',
        resist: false,
      };
    case 'LIQUIDITY_TRAP':
      return {
        stroke: '#a855f7',
        fill: 'rgba(168,85,247,0.28)',
        core: 'rgba(147,51,234,0.36)',
        resist: true,
      };
    case 'FAST_PASS':
      return {
        stroke: '#94a3b8',
        fill: 'rgba(148,163,184,0.20)',
        core: 'rgba(100,116,139,0.26)',
        resist: false,
      };
    default:
      return {
        stroke: '#64748b',
        fill: 'rgba(100,116,139,0.22)',
        core: 'rgba(71,85,105,0.28)',
        resist: false,
      };
  }
}

function fmtRange(lo: number, hi: number): string {
  return `${lo.toFixed(0)} ~ ${hi.toFixed(0)}`;
}

function strengthPrefix(z: AmzMarketZone): string {
  if (z.currentStrength >= 75) return '강한 ';
  if (z.currentStrength >= 55) return '';
  return '약한 ';
}

function roleTitleBase(z: AmzMarketZone): string {
  return z.roleKo.replace(/^강한\s+/, '').replace(/^약한\s+/, '');
}

function zoneSpan(
  candles: Candle[],
  formTime: number,
  upper: number,
  lower: number
): { t1: number; t2: number } {
  const n = candles.length;
  if (n < 2) {
    const now = Math.floor(Date.now() / 1000);
    return { t1: now - 3600, t2: now };
  }
  const span = mergedDeskAnalyzedZoneSpanTimes(candles, {
    id: 'ai-market-zone',
    time1: formTime > 0 ? formTime : undefined,
    price1: upper,
    price2: lower,
  });
  if (span && Number(span.t1) > 0 && Number(span.t2) > 0) {
    return { t1: Number(span.t1), t2: Number(span.t2) };
  }
  const t2 = Number(candles[n - 1]!.time);
  const t1 = Number(candles[Math.max(0, n - Math.min(48, n))]!.time);
  return { t1: formTime > 0 && formTime < t2 ? formTime : t1, t2 };
}

/**
 * Zone 네모만 (캡션 없음) — 라벨은 amzZonesToPriceLines 축 주입.
 */
export function amzZonesToOverlays(zones: AmzMarketZone[], candles: Candle[] = []): OverlayItem[] {
  const out: OverlayItem[] = [];
  for (const z of zones) {
    const col = roleColor(z.role);
    const detail = buildAmzZoneDetailKo(z);
    const narr = buildAmzFeatureExplainKo(z);
    const tip = [detail, '', narr, '', ...(z.stateLogKo ?? []).slice(0, 2)].join('\n');
    const title = `AI ${strengthPrefix(z)}${roleTitleBase(z)}`;
    const rangeLine = fmtRange(z.outerLower, z.outerUpper);
    const { t1, t2 } = zoneSpan(candles, Number(z.createdAt) || 0, z.outerUpper, z.outerLower);
    const kind = col.resist ? 'supplyZone' : 'demandZone';
    const approach = isAmzApproachState(z.state);

    out.push({
      id: `ai-market-zone-outer-${z.id}`,
      kind,
      category: 'aiMarketZone',
      label: `${title} ${rangeLine}`,
      zoneFaceBase: '',
      zoneFaceSignal: '',
      zoneFaceDetailKo: tip,
      x1: 0,
      y1: 0,
      x2: 1,
      y2: 0,
      time1: t1,
      time2: t2,
      price1: z.outerUpper,
      price2: z.outerLower,
      priceFrozen1: z.outerUpper,
      priceFrozen2: z.outerLower,
      confidence: z.currentStrength,
      color: col.fill,
      labelBackgroundColor: col.fill,
      labelTextColor: '#f8fafc',
      labelTooltip: tip,
      zonePulse: approach,
      zoneFillPreserve: true,
      zoneSpanOnly: false,
      structureBias: col.resist ? 'bearish' : 'bullish',
      /** 면만 — 우측 알약/콜아웃 끔. 정보는 축 라벨·AI존카드 */
      overlayZoneExtraClass: [
        'ai-market-zone',
        'ai-market-zone-outer',
        'merged-desk-zone-face-minimal',
        col.resist ? 'hotzone-signal--short' : 'hotzone-signal--long',
      ]
        .filter(Boolean)
        .join(' '),
      noProject: true,
    } as OverlayItem);

    if (
      z.coreUpper > z.coreLower &&
      z.coreUpper - z.coreLower < (z.outerUpper - z.outerLower) * 0.95
    ) {
      out.push({
        id: `ai-market-zone-core-${z.id}`,
        kind,
        category: 'aiMarketZone',
        label: `AI핵심 ${fmtRange(z.coreLower, z.coreUpper)}`,
        zoneFaceBase: '',
        zoneFaceSignal: '',
        zoneFaceDetailKo: tip,
        x1: 0,
        y1: 0,
        x2: 1,
        y2: 0,
        time1: t1,
        time2: t2,
        price1: z.coreUpper,
        price2: z.coreLower,
        priceFrozen1: z.coreUpper,
        priceFrozen2: z.coreLower,
        confidence: z.defenseScore,
        color: col.core,
        labelBackgroundColor: col.core,
        labelTextColor: '#f8fafc',
        labelTooltip: tip,
        zoneFillPreserve: true,
        zoneSpanOnly: false,
        structureBias: col.resist ? 'bearish' : 'bullish',
        overlayZoneExtraClass:
          'ai-market-zone ai-market-zone-core merged-desk-zone-face-minimal',
        noProject: true,
      } as OverlayItem);
    }
  }
  return out;
}

/** 가격축 한글 라벨 주입 (알약 대체) */
export function amzZonesToPriceLines(zones: AmzMarketZone[]): AtlasPulsePriceLine[] {
  return amzZonesToAxisPriceLines(zones);
}
