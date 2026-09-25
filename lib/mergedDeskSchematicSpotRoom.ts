/**
 * 현물 기준 도식 상·하단까지 남은 거리(%). 확정 아님.
 */
import type { MergedDeskElliottRead } from '@/lib/mergedDeskElliottWave';
import type { MergedDeskWyckoffRead } from '@/lib/mergedDeskWyckoffCycle';
import type { SchoolSchematicPin } from '@/lib/mergedDeskSchoolSchematicCatalog';
import { formatSchematicPrice } from '@/lib/mergedDeskSchematicSeatPrice';
import { schematicHotspotLabelKo } from '@/lib/mergedDeskSchematicShapeMatch';

export type SchematicRoomLeg = {
  price: number;
  pct: number;
  ko: string;
  reached: boolean;
};

export type SchematicSpotRoom = {
  last: number;
  seatLab: string;
  up?: SchematicRoomLeg;
  down?: SchematicRoomLeg;
};

function pctMove(from: number, to: number): number {
  if (!(from > 0) || !Number.isFinite(to)) return 0;
  return ((to - from) / from) * 100;
}

function fmtPct(p: number): string {
  const a = Math.abs(p);
  const n = a >= 10 ? a.toFixed(1) : a.toFixed(2);
  return `${p >= 0 ? '+' : '−'}${n}%`;
}

export function buildSchematicSpotRoom(params: {
  last: number;
  pin?: SchoolSchematicPin | null;
  wyckoff?: MergedDeskWyckoffRead | null;
  elliott?: MergedDeskElliottRead | null;
  hotspotKey?: string;
}): SchematicSpotRoom | null {
  const last = params.last;
  if (!Number.isFinite(last) || !(last > 0)) return null;

  const seatLab = params.hotspotKey ? schematicHotspotLabelKo(params.hotspotKey) : '';
  let upPx = params.pin?.bounceTo;
  let downPx = params.pin?.dumpTo;
  let upName = '저항';
  let downName = '지지';

  const w = params.wyckoff;
  if (w && Number.isFinite(w.resist) && Number.isFinite(w.support) && w.resist > w.support) {
    upPx = Math.max(w.resist, w.event === 'UT' || w.event === 'UTAD' || w.event === 'BC' ? w.eventPrice : w.resist);
    downPx = w.support;
    if (w.schematic === 'distribution' || w.macro === 'distribution' || w.macro === 'markdown') {
      upName = seatLab && /UT|BC|PSY|ST/i.test(seatLab) ? `도식 ${seatLab}·저항` : 'TR저항';
      downName = 'TR지지·SOW';
    } else {
      upName = 'TR저항·SOS';
      downName = seatLab && /SC|ST|Spring|LPS|AR/i.test(seatLab) ? `도식 ${seatLab}·지지` : 'TR지지';
    }
  }

  const e = params.elliott;
  if (e?.levels && (upPx == null || downPx == null)) {
    if (params.pin?.bounceTo != null) {
      upPx = params.pin.bounceTo;
      upName = params.pin.bounceKo?.replace(/\s*·.*/, '') || '반등목표';
    }
    if (params.pin?.dumpTo != null) {
      downPx = params.pin.dumpTo;
      downName = '하락목표';
    }
  }

  const out: SchematicSpotRoom = { last, seatLab };
  const EPS = 0.08;

  if (upPx != null && Number.isFinite(upPx) && upPx > 0) {
    const pct = pctMove(last, upPx);
    const reached = pct <= EPS;
    out.up = {
      price: upPx,
      pct,
      reached,
      ko: reached
        ? `상승여유 소진 · ${upName} ${formatSchematicPrice(upPx)}`
        : `현물 기준 ${upName}까지 ${fmtPct(pct)} 더 올려야 · ${formatSchematicPrice(upPx)}`,
    };
  }
  if (downPx != null && Number.isFinite(downPx) && downPx > 0 && downPx !== upPx) {
    const pct = pctMove(last, downPx);
    const reached = pct >= -EPS;
    out.down = {
      price: downPx,
      pct,
      reached,
      ko: reached
        ? `하락여유 소진 · ${downName} ${formatSchematicPrice(downPx)}`
        : `현물 기준 ${downName}까지 ${fmtPct(pct)} 더 내려야 · ${formatSchematicPrice(downPx)}`,
    };
  }
  if (!out.up && !out.down) return null;
  return out;
}
