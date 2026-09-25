/**
 * E/SL/TP/무효 라벨 정책 · 접근 반짝 · TP 터치 축하 마커.
 */
import type { Candle, OverlayItem } from '@/types';
import type { AtlasPulsePriceLine } from '@/lib/monthDeskAtlasPulseDesk';
import type { MergedDeskActiveTradePlan } from '@/lib/mergedDeskActiveTradePlan';
import type { PracticeAiPlanPack } from '@/lib/mergedDeskPracticeAiPlan';

export type TradeLabelPolicy = {
  showInvalid: boolean;
  showTp2: boolean;
  showTp3: boolean;
  approachPulse: boolean;
  tpCelebrate: boolean;
};

export type TradeVisualFxState = {
  approaching: Array<'entry' | 'sl' | 'tp1' | 'tp2' | 'tp3' | 'inv'>;
  celebrating: Array<'tp1' | 'tp2' | 'tp3'>;
  approachDumpTf: string | null;
};

function near(price: number, level: number, ratio: number): boolean {
  if (!(price > 0) || !(level > 0)) return false;
  return Math.abs(price - level) / level <= ratio;
}

function touched(last: Candle | null | undefined, level: number): boolean {
  if (!last || !(level > 0)) return false;
  const lo = Number(last.low);
  const hi = Number(last.high);
  return lo <= level && level <= hi;
}

export function computeTradeVisualFxState(params: {
  price: number;
  lastCandle?: Candle | null;
  plan?: MergedDeskActiveTradePlan | null;
  practiceAi?: PracticeAiPlanPack | null;
  dumpZones?: Array<{ sourceTf: string; mid: number; top: number; bot: number }>;
  approachRatio?: number;
}): TradeVisualFxState {
  const price = Number(params.price);
  const last = params.lastCandle ?? null;
  const tol = params.approachRatio ?? 0.0045;
  const entry = params.plan?.entry || params.practiceAi?.entry || 0;
  const sl = params.plan?.stopLoss || params.practiceAi?.stopLoss || 0;
  const tp1 = params.plan?.tp1 || params.practiceAi?.tp1 || 0;
  const tp2 = params.plan?.tp2 || params.practiceAi?.tp2 || 0;
  const tp3 = params.plan?.tp3 || params.practiceAi?.tp3 || 0;
  const inv = params.plan?.invalidationPrice || params.practiceAi?.invalidationPrice || sl;

  const approaching: TradeVisualFxState['approaching'] = [];
  const celebrating: TradeVisualFxState['celebrating'] = [];

  if (near(price, entry, tol) && !touched(last, entry)) approaching.push('entry');
  if (near(price, sl, tol) && !touched(last, sl)) approaching.push('sl');
  if (near(price, tp1, tol) && !touched(last, tp1)) approaching.push('tp1');
  if (near(price, tp2, tol) && !touched(last, tp2)) approaching.push('tp2');
  if (near(price, tp3, tol) && !touched(last, tp3)) approaching.push('tp3');
  if (near(price, inv, tol) && !touched(last, inv)) approaching.push('inv');

  if (touched(last, tp1)) celebrating.push('tp1');
  if (touched(last, tp2)) celebrating.push('tp2');
  if (touched(last, tp3)) celebrating.push('tp3');

  let approachDumpTf: string | null = null;
  for (const z of params.dumpZones ?? []) {
    if (price >= z.bot - (z.top - z.bot) * 0.15 && price <= z.top + (z.top - z.bot) * 0.15) {
      approachDumpTf = z.sourceTf;
      break;
    }
  }

  return { approaching, celebrating, approachDumpTf };
}

export function applyTradeLabelPolicy(
  lines: AtlasPulsePriceLine[],
  policy: TradeLabelPolicy
): AtlasPulsePriceLine[] {
  return lines.filter((pl) => {
    const t = String(pl.title || '');
    if (!policy.showInvalid && /무효|INV|Invalid/i.test(t)) return false;
    if (!policy.showTp2 && /TP2|목표2/i.test(t)) return false;
    if (!policy.showTp3 && /TP3|목표3/i.test(t)) return false;
    return true;
  });
}

export function decorateTradePriceLinesFx(
  lines: AtlasPulsePriceLine[],
  fx: TradeVisualFxState,
  policy: TradeLabelPolicy
): AtlasPulsePriceLine[] {
  const filtered = applyTradeLabelPolicy(lines, policy);
  return filtered.map((pl) => {
    const t = String(pl.title || '');
    let pulse = false;
    let celebrate = false;
    if (/진입|Entry|^E\b/i.test(t) && fx.approaching.includes('entry')) pulse = true;
    if (/손절|SL|Stop/i.test(t) && fx.approaching.includes('sl')) pulse = true;
    if (/TP1|목표(?!2|3)/i.test(t) && fx.approaching.includes('tp1')) pulse = true;
    if (/TP2|목표2/i.test(t) && fx.approaching.includes('tp2')) pulse = true;
    if (/TP3|목표3/i.test(t) && fx.approaching.includes('tp3')) pulse = true;
    if (/무효|INV/i.test(t) && fx.approaching.includes('inv')) pulse = true;
    if (/TP1|목표(?!2|3)/i.test(t) && fx.celebrating.includes('tp1')) celebrate = true;
    if (/TP2|목표2/i.test(t) && fx.celebrating.includes('tp2')) celebrate = true;
    if (/TP3|목표3/i.test(t) && fx.celebrating.includes('tp3')) celebrate = true;

    let title = t;
    if (pulse && policy.approachPulse && !/접근/.test(t)) title = `${t} · 접근`;
    if (celebrate && policy.tpCelebrate && !/터치/.test(t)) title = `${t} · 터치`;

    return {
      ...pl,
      title: title.slice(0, 28),
      axisLabel: pl.axisLabel !== false,
      lineWidth: celebrate ? 3 : pulse ? 2 : pl.lineWidth,
      lineStyle: pulse ? 'solid' : pl.lineStyle,
      color: celebrate ? '#fde047' : pulse ? '#fbbf24' : pl.color,
    };
  });
}

export function buildTpCelebrateOverlays(params: {
  candles: Candle[];
  fx: TradeVisualFxState;
  plan?: MergedDeskActiveTradePlan | null;
  practiceAi?: PracticeAiPlanPack | null;
}): OverlayItem[] {
  if (!params.fx.celebrating.length) return [];
  const n = params.candles.length;
  if (n < 2) return [];
  const t = Number(params.candles[n - 1]!.time);
  const entry = params.plan?.entry || params.practiceAi?.entry || 0;
  const levels: Array<{ key: 'tp1' | 'tp2' | 'tp3'; px: number; label: string }> = [
    { key: 'tp1', px: params.plan?.tp1 || params.practiceAi?.tp1 || 0, label: 'TP1' },
    { key: 'tp2', px: params.plan?.tp2 || params.practiceAi?.tp2 || 0, label: 'TP2' },
    { key: 'tp3', px: params.plan?.tp3 || params.practiceAi?.tp3 || 0, label: 'TP3' },
  ];
  const out: OverlayItem[] = [];
  for (const lv of levels) {
    if (!(lv.px > 0) || !params.fx.celebrating.includes(lv.key)) continue;
    out.push({
      id: `merged-desk-tp-celebrate-${lv.key}`,
      kind: 'label',
      category: 'chartPrimeTrendChannels',
      label: `🎆 ${lv.label}`,
      zoneFaceBase: `🎆${lv.label}`,
      x1: 0,
      y1: 0,
      time1: t,
      price1: lv.px,
      confidence: 90,
      color: '#fde047',
      labelBackgroundColor: 'rgba(69,48,12,0.92)',
      labelTextColor: '#fef9c3',
      overlayZoneExtraClass: 'merged-desk-tp-celebrate merged-desk-zone-label-on',
      labelTooltip: `${lv.label} 터치 · 기록됨 · 확정 수익 아님`,
      noProject: true,
    });
  }
  if (params.fx.celebrating.length && entry > 0) {
    out.push({
      id: 'merged-desk-tp-celebrate-core',
      kind: 'label',
      category: 'chartPrimeTrendChannels',
      label: '🎆 TP터치',
      time1: t,
      price1: entry,
      color: '#fde047',
      overlayZoneExtraClass: 'merged-desk-tp-celebrate-pin',
      noProject: true,
    });
  }
  return out;
}
