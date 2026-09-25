/**
 * FAKE BREAKOUT/BREAKDOWN — 캔들·가격에 붙는 차트 핀 (HUD 플로팅 콜아웃 대체).
 */
import type { OverlayItem } from '@/types';
import type { FalseBreakReport } from './falseBreakEngine';
import type { StructureEvent } from './structureEngine';

export function buildEagle1FakeBreakChartOverlay(params: {
  falseBreak?: FalseBreakReport | null;
  structureEvents?: StructureEvent[] | null;
  candles: Array<{ time: number; high?: number; low?: number; close?: number }>;
}): OverlayItem | null {
  const fb = params.falseBreak;
  if (!fb || (fb.kind !== 'FAKE_BREAKOUT' && fb.kind !== 'FAKE_BREAKDOWN')) return null;
  const candles = params.candles;
  if (candles.length < 2) return null;

  const fail = [...(params.structureEvents ?? [])].reverse().find((e) => e.kind === 'FAILED_BREAK');
  const rawIdx =
    fb.anchorIndex != null && Number.isFinite(fb.anchorIndex)
      ? fb.anchorIndex
      : fail != null && Number.isFinite(fail.known_at)
        ? fail.known_at
        : fail != null && Number.isFinite(fail.index)
          ? fail.index
          : candles.length - 1;
  const i = Math.max(0, Math.min(candles.length - 1, Math.round(Number(rawIdx))));
  const c = candles[i]!;
  const price =
    fail != null && Number.isFinite(fail.level)
      ? fail.level
      : fb.kind === 'FAKE_BREAKDOWN'
        ? Number(c.low ?? c.close)
        : Number(c.high ?? c.close);
  if (!(price > 0) || !Number.isFinite(price)) return null;

  const t1 = Number(c.time);
  if (!(t1 > 0)) return null;
  const t2 = Number(candles[Math.min(candles.length - 1, i + 2)]?.time ?? t1);
  const en = fb.kind === 'FAKE_BREAKOUT' ? 'FAKE BREAKOUT' : 'FAKE BREAKDOWN';
  const ko = fb.labelKo || (fb.kind === 'FAKE_BREAKOUT' ? '가짜돌파' : '가짜이탈');

  return {
    id: 'eagle1-fake-break-pin',
    kind: 'label',
    label: `${en} · ${ko}`,
    x1: 0,
    y1: 0,
    x2: 1,
    y2: 1,
    time1: t1,
    time2: t2 > t1 ? t2 : t1,
    price1: price,
    price2: price,
    priceFrozen1: price,
    priceFrozen2: price,
    confidence: 78,
    color: 'rgba(250, 204, 21, 0.95)',
    lineStrokeWidth: 1.5,
    category: 'structure',
    noProject: true,
    overlayZoneExtraClass:
      'eagle1-structure eagle1-structure-mark eagle1-fake-break-pin eagle1-hud-keep merged-desk-zone-label-on',
    zoneFaceBase: en,
    zoneFaceSignal: ko,
    labelTooltip: `${en} · ${ko} · 확정 수익 아님`,
  };
}
