/**
 * §7 LIQUIDITY MAP — EQH/EQL · 청산대 · PDH/PDL 등.
 */
import { runLiqZoneEngine, type LiqZoneReport } from '@/lib/eagle1/liqZoneEngine';
import { lastSweepLiquidity, type Eagle1Bar, type StructureSnapshot } from '@/lib/eagle1/structureEngine';
import type { TapPriorLevel } from './pdhPdlLevels';

export type TapLiqNodeKind =
  | 'EQH'
  | 'EQL'
  | 'SSL'
  | 'BSL'
  | 'LONG_LIQ'
  | 'SHORT_LIQ'
  | TapPriorLevel['kind']
  | 'SWING_HI'
  | 'SWING_LO';

export type TapLiqNode = {
  kind: TapLiqNodeKind;
  price: number;
  side: 'above' | 'below' | 'at';
  labelKo: string;
  strength: number;
  sourceTf?: string;
};

export type TapLiquidityMap = {
  nodes: TapLiqNode[];
  above: TapLiqNode[];
  below: TapLiqNode[];
  summaryKo: string;
  liqZone: LiqZoneReport | null;
};

function sideOf(price: number, px: number): TapLiqNode['side'] {
  const d = (price - px) / Math.max(px, 1e-9);
  if (Math.abs(d) < 0.0004) return 'at';
  return price > px ? 'above' : 'below';
}

function pushNode(
  out: TapLiqNode[],
  kind: TapLiqNodeKind,
  price: number | null | undefined,
  px: number,
  labelKo: string,
  strength: number,
  sourceTf?: string
) {
  const p = Number(price);
  if (!(p > 0) || !(px > 0)) return;
  out.push({
    kind,
    price: p,
    side: sideOf(p, px),
    labelKo,
    strength,
    sourceTf,
  });
}

export function buildTapLiquidityMap(params: {
  price: number;
  structure: StructureSnapshot | null;
  bars: Eagle1Bar[];
  priorLevels?: TapPriorLevel[] | null;
}): TapLiquidityMap {
  const px = params.price;
  const nodes: TapLiqNode[] = [];
  let liqZone: LiqZoneReport | null = null;

  if (params.structure && params.bars.length >= 20) {
    try {
      liqZone = runLiqZoneEngine({
        candles: params.bars,
        structure: params.structure,
      });
    } catch {
      liqZone = null;
    }
    const sweep = lastSweepLiquidity(params.structure.events);
    const eqh = params.structure.equalHighs.slice(-1)[0];
    const eql = params.structure.equalLows.slice(-1)[0];
    pushNode(nodes, 'EQH', eqh, px, 'EQH', 70);
    pushNode(nodes, 'EQL', eql, px, 'EQL', 70);
    pushNode(nodes, 'SSL', sweep.ssl, px, 'Sell-side Liq', 75);
    pushNode(nodes, 'BSL', sweep.bsl, px, 'Buy-side Liq', 75);
    pushNode(
      nodes,
      'SWING_HI',
      params.structure.lastSwingHigh?.price,
      px,
      '스윙고',
      55
    );
    pushNode(
      nodes,
      'SWING_LO',
      params.structure.lastSwingLow?.price,
      px,
      '스윙저',
      55
    );
    if (liqZone?.longLiq) {
      pushNode(nodes, 'LONG_LIQ', liqZone.longLiq.mid, px, liqZone.longLiq.labelKo, 65);
    }
    if (liqZone?.shortLiq) {
      pushNode(nodes, 'SHORT_LIQ', liqZone.shortLiq.mid, px, liqZone.shortLiq.labelKo, 65);
    }
  }

  for (const lv of params.priorLevels || []) {
    pushNode(nodes, lv.kind, lv.price, px, lv.kind, 80, lv.tf);
  }

  /** 가격 근접순 · 중복 제거(0.05% 이내 같은 종류) */
  const dedup: TapLiqNode[] = [];
  const sorted = [...nodes].sort(
    (a, b) => Math.abs(a.price - px) - Math.abs(b.price - px)
  );
  for (const n of sorted) {
    const hit = dedup.find(
      (d) =>
        d.kind === n.kind &&
        Math.abs(d.price - n.price) / Math.max(px, 1) < 0.0005
    );
    if (!hit) dedup.push(n);
  }

  const above = dedup.filter((n) => n.side === 'above').slice(0, 8);
  const below = dedup.filter((n) => n.side === 'below').slice(0, 8);
  const at = dedup.filter((n) => n.side === 'at').slice(0, 4);

  const summaryKo = [
    above[0] ? `위 ${above[0].labelKo}@${above[0].price.toFixed(2)}` : null,
    below[0] ? `아래 ${below[0].labelKo}@${below[0].price.toFixed(2)}` : null,
    liqZone?.summaryKo || null,
  ]
    .filter(Boolean)
    .join(' · ') || '유동성맵 데이터부족';

  return {
    nodes: [...at, ...above, ...below],
    above,
    below,
    summaryKo,
    liqZone,
  };
}
