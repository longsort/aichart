/**
 * Eagle1 구조 이벤트 → compact 작도. 실전은 숨기고, 분석/연구에서만 최근 이벤트.
 * 기존 데스크 SMC 엔진은 삭제하지 않는다.
 */
import type { OverlayItem } from '@/types';
import type { Eagle1ChartMode } from './chartUx';
import type { StructureEvent } from './structureEngine';
import { lastStructureEventKo } from './structureEngine';

function kindOf(ev: StructureEvent): OverlayItem['kind'] {
  if (ev.kind === 'CHOCH') return 'choch';
  if (ev.kind === 'SWEEP') return 'liquiditySweep';
  if (ev.kind === 'FAILED_BREAK') return 'falseBreakout';
  return 'bos';
}

function colorOf(ev: StructureEvent): string {
  if (ev.kind === 'SWEEP') return 'rgba(250,204,21,0.9)';
  if (ev.kind === 'FAILED_BREAK') return 'rgba(248,113,113,0.92)';
  return ev.bias === 'bullish' ? 'rgba(52,211,153,0.92)' : 'rgba(248,113,113,0.92)';
}

function compactLabel(ev: StructureEvent): string {
  return lastStructureEventKo([ev]);
}

function overlayIdOf(ev: StructureEvent): string {
  const tag =
    ev.kind === 'FAILED_BREAK' ? 'fake' : ev.kind === 'SWEEP' ? 'sweep' : ev.kind === 'CHOCH' ? 'choch' : 'bos';
  return `eagle1-${tag}-${ev.known_at}-${ev.index}`;
}

export function eagle1StructureToOverlays(params: {
  events?: StructureEvent[] | null;
  candles?: Array<{ time: number }> | null;
  lastTime: number;
  mode: Eagle1ChartMode;
}): OverlayItem[] {
  const mode = params.mode || 'practical';
  if (mode === 'practical') return [];
  const lastTime = params.lastTime;
  if (!(lastTime > 0)) return [];
  const candles = params.candles ?? [];
  const live = (params.events ?? []).filter((e) => e.kind !== 'SWING');
  if (!live.length) return [];

  const pick: StructureEvent[] = [];
  const lastBos = [...live].reverse().find((e) => e.kind === 'BOS' || e.kind === 'CHOCH');
  const lastSweep = [...live].reverse().find((e) => e.kind === 'SWEEP');
  const lastFail = [...live].reverse().find((e) => e.kind === 'FAILED_BREAK');
  if (mode === 'research') {
    pick.push(...live.slice(-8));
  } else {
    if (lastBos) pick.push(lastBos);
    if (lastSweep) pick.push(lastSweep);
    if (lastFail) pick.push(lastFail);
  }

  const seen = new Set<string>();
  const out: OverlayItem[] = [];
  for (const ev of pick) {
    const id = overlayIdOf(ev);
    if (seen.has(id)) continue;
    seen.add(id);
    const t1 = Number(candles[ev.known_at]?.time ?? candles[ev.index]?.time ?? lastTime);
    out.push({
      id,
      kind: kindOf(ev),
      label: compactLabel(ev),
      x1: 0,
      y1: 0,
      x2: 1,
      y2: 1,
      time1: t1,
      time2: lastTime,
      price1: ev.level,
      price2: ev.level,
      priceFrozen1: ev.level,
      priceFrozen2: ev.level,
      confidence: 70,
      color: colorOf(ev),
      category: 'structure',
      structureBias: ev.bias,
      noProject: true,
      overlayZoneExtraClass: 'eagle1-structure',
      labelTooltip: ev.evidence.join(' · ') || compactLabel(ev),
    });
  }
  return out;
}
