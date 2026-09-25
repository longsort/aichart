/**
 * 마감·안착 — SMC 교재식 구조(CHoCH·BOS·OB) **라이트** 작도 (교육·참고).
 * full 모드는 SMC 데스크에서 — 마감·안착은 차트 맑음 우선.
 */
import type { Candle, OverlayItem } from '@/types';
import { buildSmcDeskOverlayPack } from '@/lib/smcDeskOverlay';
import { buildSmcEntryPlaybookOverlays } from '@/lib/smcPlaybook/overlays';
import type { SmcEntryPlaybook } from '@/lib/smcPlaybook/types';

const MAX_STRUCTURE_MARKS_LITE = 2;
const MAX_OB_LITE = 1;

/** 플레이북 full 작도 시 id — lite는 단계 라벨 + 활성 타점 존만 */
const PLAYBOOK_LITE_IDS = new Set(['smc-entry-playbook-phase', 'smc-entry-playbook-zone']);

function remapMonthDeskSmcOverlay(o: OverlayItem): OverlayItem {
  const id = String(o.id || '').replace(/^smc-desk-/, 'month-desk-smc-');
  return { ...o, id };
}

function barIndexFromSmcOverlayId(id: string): number {
  const m = id.match(/-(?:bos|choch)-\d+-(\d+)$/);
  return m ? Number(m[1]) : 0;
}

function pickLiteStructureOverlays(struct: OverlayItem[]): OverlayItem[] {
  if (struct.length <= MAX_STRUCTURE_MARKS_LITE) return struct;
  const parsed = struct
    .map((o) => ({
      o,
      barIdx: barIndexFromSmcOverlayId(String(o.id || '')),
      isChoch: o.kind === 'choch',
    }))
    .sort((a, b) => b.barIdx - a.barIdx);

  const kept: OverlayItem[] = [];
  const latestChoch = parsed.find((p) => p.isChoch);
  if (latestChoch) kept.push(latestChoch.o);

  const latestBos = parsed.find((p) => !p.isChoch);
  if (latestBos && !kept.some((k) => k.id === latestBos.o.id)) kept.push(latestBos.o);

  if (kept.length < MAX_STRUCTURE_MARKS_LITE) {
    for (const p of parsed) {
      if (kept.length >= MAX_STRUCTURE_MARKS_LITE) break;
      if (!kept.some((k) => k.id === p.o.id)) kept.push(p.o);
    }
  }
  return kept.slice(0, MAX_STRUCTURE_MARKS_LITE);
}

function pickLiteObOverlays(obs: OverlayItem[], close: number): OverlayItem[] {
  if (obs.length <= MAX_OB_LITE) return obs;
  if (!Number.isFinite(close) || close <= 0) return obs.slice(-MAX_OB_LITE);
  let best = obs[0]!;
  let bestDist = Infinity;
  for (const o of obs) {
    const mid = ((Number(o.price1) || 0) + (Number(o.price2) || 0)) / 2;
    const d = Math.abs(mid - close);
    if (d < bestDist) {
      bestDist = d;
      best = o;
    }
  }
  return [best];
}

/** BOS/CHOCH(최대 2) + OB(1) — EQ·MSB 과다 라벨 제외(lite) */
export function buildMonthDeskSmcDiagramOverlays(
  candles: Candle[],
  timeframe: string,
  swingPivot: number,
  density: 'lite' | 'full' = 'lite'
): OverlayItem[] {
  if (candles.length < 12) return [];
  const L = Math.max(2, Math.min(4, Math.floor(swingPivot || 2)));
  const pack = buildSmcDeskOverlayPack(candles, timeframe, {
    showEq: false,
    showOrderBlocks: true,
    showStructure: true,
    showZoneStrength: false,
    swingPivot: L,
  }).map(remapMonthDeskSmcOverlay);

  if (density === 'full') return pack;

  const close = Number(candles[candles.length - 1]?.close);
  const structure = pack.filter((o) => o.kind === 'bos' || o.kind === 'choch');
  const obs = pack.filter((o) => o.kind === 'ob');
  return [...pickLiteStructureOverlays(structure), ...pickLiteObOverlays(obs, close)];
}

export function buildMonthDeskSmcPlaybookOverlays(
  playbook: SmcEntryPlaybook,
  candles: Candle[],
  timeframe: string,
  density: 'lite' | 'full' = 'lite'
): OverlayItem[] {
  if (!candles.length) return [];
  const full = buildSmcEntryPlaybookOverlays(playbook, candles, timeframe);
  if (density === 'full') return full;
  return full.filter((o) => PLAYBOOK_LITE_IDS.has(String(o.id || '')));
}
