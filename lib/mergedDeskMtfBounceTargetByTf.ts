/**
 * MTF 폭락 — TF별 반등 1차 구간(지지→상단 폭등감시 한도).
 * 차트 zone 면 작도 + 분석 행. 확정 목표·승률 아님.
 */
import type { Candle, OverlayItem } from '@/types';
import type { AtlasPulsePriceLine } from '@/lib/monthDeskAtlasPulseDesk';
import { normalizeChartTimeframe, timeframeRank } from '@/lib/constants';
import type { DumpCeilingReachStat } from '@/lib/mergedDeskDumpCeilingReachStats';
import { formatReachConditionalKo } from '@/lib/mergedDeskSupportResistScore';
import { formatZoneFacePrice, dumpTfSetRoleVisual } from '@/lib/mergedDeskDumpLifeCycle';
import { mergedDeskTfLabelKo } from '@/lib/mergedDeskMtfDumpZoneBridge';
import type { MtfDumpZoneSpec } from '@/lib/mergedDeskMtfDumpZoneBridge';

/** TF별 1차 반등 구간 분석 행 */
export type MtfDumpBounceTargetRow = {
  sourceTf: string;
  sourceTfKo: string;
  /** 하방 폭락 floor mid — 지지 후보 */
  supportPx: number | null;
  /** 상방 폭등감시 ceiling 하단 — 반등 1차 한도 */
  bounce1Px: number | null;
  /** 현재가 → bounce1 (+%) */
  gapPct: number | null;
  /** 현재가가 지지 위·한도 전 = 반등 구간 안 */
  inBounceZone: boolean;
  /** 지지 터치/반등진행 */
  touchedSupport: boolean;
  reachPct: number | null;
  reachSample: number | null;
  /** 한 줄 요약 */
  lineKo: string;
};

export type MtfDumpBounceTargetPack = {
  rows: MtfDumpBounceTargetRow[];
  /** 차트 TF 또는 BOUNCE 시 활성 행 */
  activeRow: MtfDumpBounceTargetRow | null;
  summaryKo: string;
};

const BOUNCE_TF_ORDER = ['15m', '1h', '4h', '1d', '1w', '1M'] as const;

function zoneMid(z: MtfDumpZoneSpec): number {
  const mid = Number(z.mid);
  if (mid > 0) return mid;
  return (Number(z.top) + Number(z.bot)) / 2;
}

function ceilingTarget(z: MtfDumpZoneSpec): number {
  const bot = Math.min(Number(z.bot), Number(z.top));
  const mid = zoneMid(z);
  return bot > 0 ? bot : mid;
}

function floorSupport(z: MtfDumpZoneSpec): number {
  const mid = zoneMid(z);
  const bot = Math.min(Number(z.bot), Number(z.top));
  return bot > 0 && bot < mid * 1.002 ? bot : mid;
}

/**
 * zones + reach 통계 → TF별 반등 1차 구간表.
 */
export function buildMtfDumpBounceTargetByTf(params: {
  zones: MtfDumpZoneSpec[];
  priceNow: number;
  chartTf: string;
  chartCandles?: Candle[] | null;
  reachByTf?: DumpCeilingReachStat[];
  /** 반등진행 등 — 활성 TF 우선 */
  pathScenarioKo?: string;
}): MtfDumpBounceTargetPack {
  const empty: MtfDumpBounceTargetPack = { rows: [], activeRow: null, summaryKo: '' };
  const price = Number(params.priceNow);
  if (!(price > 0)) return empty;

  const candles = params.chartCandles ?? [];
  const last = candles.length > 0 ? candles[candles.length - 1]! : null;
  const lo = last ? Number(last.low) : price;
  const hi = last ? Number(last.high) : price;

  const reachMap = new Map(
    (params.reachByTf ?? []).map((r) => [normalizeChartTimeframe(r.sourceTf), r])
  );

  const floors = new Map<string, MtfDumpZoneSpec>();
  const ceilings = new Map<string, MtfDumpZoneSpec>();
  for (const z of params.zones ?? []) {
    const tf = normalizeChartTimeframe(z.sourceTf);
    if (z.bandRole === 'ceiling') {
      if (!ceilings.has(tf)) ceilings.set(tf, z);
    } else {
      if (!floors.has(tf)) floors.set(tf, z);
    }
  }

  const chartTf = normalizeChartTimeframe(params.chartTf);
  const tfs = [...BOUNCE_TF_ORDER]
    .filter((tf) => floors.has(tf) || ceilings.has(tf))
    .sort((a, b) => timeframeRank(a) - timeframeRank(b));

  const rows: MtfDumpBounceTargetRow[] = [];
  for (const tf of tfs) {
    const floor = floors.get(tf);
    const ceil = ceilings.get(tf);
    const supportPx = floor ? floorSupport(floor) : null;
    let bounce1Px = ceil ? ceilingTarget(ceil) : null;
    if (bounce1Px != null && bounce1Px <= price * 1.001) bounce1Px = null;

    const gapPct =
      bounce1Px != null && bounce1Px > price
        ? Math.round(((bounce1Px - price) / price) * 1000) / 10
        : null;

    const supportOk = supportPx != null && supportPx > 0;
    const inBounceZone =
      supportOk &&
      price >= (supportPx as number) * 0.998 &&
      (bounce1Px == null || price < bounce1Px * 1.002);

    const touchedSupport =
      supportOk &&
      (lo <= (supportPx as number) * 1.004 || hi >= (supportPx as number) * 0.996) &&
      price >= (supportPx as number) * 0.997;

    const reach = reachMap.get(tf);
    const tfKo = mergedDeskTfLabelKo(tf);
    const supBit = supportPx != null ? Math.round(supportPx) : '—';
    const bounceBit = bounce1Px != null ? Math.round(bounce1Px) : '—';
    const gapBit = gapPct != null ? `(+${gapPct}%)` : '';
    const reachBit =
      reach?.reachPct != null && reach.sampleCount != null
        ? ` · ${formatReachConditionalKo(reach.reachPct, reach.sampleCount)}`
        : '';
    const stateBit = inBounceZone
      ? touchedSupport
        ? '반등구간터치'
        : '반등구간'
      : touchedSupport
        ? '지지터치'
        : '';

    const lineKo = `${tfKo} ${supBit}→반등컷 ${bounceBit}${gapBit}${stateBit ? ` · ${stateBit}` : ''}${reachBit}`;

    rows.push({
      sourceTf: tf,
      sourceTfKo: tfKo,
      supportPx,
      bounce1Px,
      gapPct,
      inBounceZone,
      touchedSupport,
      reachPct: reach?.reachPct ?? null,
      reachSample: reach?.sampleCount ?? null,
      lineKo,
    });
  }

  const activeRow =
    rows.find((r) => r.sourceTf === chartTf && (r.inBounceZone || r.touchedSupport)) ??
    rows.find((r) => r.inBounceZone || r.touchedSupport) ??
    rows.find((r) => r.sourceTf === chartTf) ??
    rows[0] ??
    null;

  const bounceRows = rows.filter((r) => r.inBounceZone || r.touchedSupport);
  const summaryKo =
    params.pathScenarioKo === '반등진행' && activeRow
      ? `${activeRow.sourceTfKo} 반등컷 ${activeRow.bounce1Px != null ? Math.round(activeRow.bounce1Px) : '—'}${activeRow.gapPct != null ? `(+${activeRow.gapPct}%)` : ''}${activeRow.reachPct != null ? ` · ${formatReachConditionalKo(activeRow.reachPct, activeRow.reachSample)}` : ''} · TF별 ${bounceRows.length || rows.length}건 · 한도 보장 아님`
      : activeRow?.lineKo ?? '';

  return { rows, activeRow, summaryKo };
}

/**
 * TF별 반등1차구간 — 지지(floor)↔폭등감시(ceiling) 사이 zone 면.
 * 색상 = 동 TF 세트색 (지지·한도·확률과 동일).
 */
export function buildMtfDumpBounce1ZoneOverlays(params: {
  pack: MtfDumpBounceTargetPack;
  zones: MtfDumpZoneSpec[];
  chartTf: string;
  time1: number;
  time2: number;
  pathScenarioKo?: string;
}): OverlayItem[] {
  const rows = params.pack.rows ?? [];
  if (!rows.length) return [];

  const chartTf = normalizeChartTimeframe(params.chartTf);
  const showAll =
    params.pathScenarioKo === '반등진행' ||
    params.pathScenarioKo === '감시' ||
    rows.some((r) => r.inBounceZone || r.touchedSupport);
  if (!showAll) return [];

  const floorLifeByTf = new Map<string, MtfDumpZoneSpec['lifeState']>();
  for (const z of params.zones ?? []) {
    if (z.bandRole === 'ceiling') continue;
    const tf = normalizeChartTimeframe(z.sourceTf);
    if (!floorLifeByTf.has(tf)) floorLifeByTf.set(tf, z.lifeState);
  }

  const activeTf = params.pack.activeRow
    ? normalizeChartTimeframe(params.pack.activeRow.sourceTf)
    : '';

  const out: OverlayItem[] = [];
  for (const row of rows) {
    const sup = row.supportPx;
    const top = row.bounce1Px;
    if (sup == null || top == null || !(sup > 0) || !(top > sup * 1.001)) continue;

    const tf = normalizeChartTimeframe(row.sourceTf);
    const midPx = (sup + top) / 2;
    const spanPct = (top - sup) / Math.max(midPx, 1);
    /**
     * 반등구간 통면(지지↔천장)은 세로폭이 커져 캔들을 누름.
     * 1h 이상·또는 가격대비 0.45% 초과면 fill 생략 — 반등컷 가격선·floor/ceiling만 유지.
     */
    if (timeframeRank(tf) >= timeframeRank('1h') || spanPct > 0.0045) continue;

    const active =
      row.inBounceZone ||
      row.touchedSupport ||
      (tf === chartTf && params.pathScenarioKo === '반등진행');
    const dim = Boolean(activeTf) && tf !== activeTf && params.pathScenarioKo === '반등진행';
    const floorLife = floorLifeByTf.get(tf);
    const floorSpec = (params.zones ?? []).find(
      (z) =>
        normalizeChartTimeframe(z.sourceTf) === tf && (z.bandRole ?? 'floor') !== 'ceiling'
    );
    const vis = dumpTfSetRoleVisual({
      tf,
      life: floorLife,
      role: 'bounce1',
      active,
      dim,
    });
    const probBit =
      row.reachPct != null && row.reachSample != null
        ? formatReachConditionalKo(row.reachPct, row.reachSample)
        : floorSpec?.srLabelKo
          ? floorSpec.srLabelKo
          : '';
    const touchBit = floorSpec?.touchLabelKo
      ? floorSpec.touchLabelKo
      : floorSpec?.touchCount != null
        ? `터치${floorSpec.touchCount}`
        : '';
    const nameKo = `${row.sourceTfKo} 반등구간`;
    const signalKo = [
      `→${Math.round(top)}`,
      row.gapPct != null ? `+${row.gapPct}%` : '',
      touchBit,
      probBit,
      row.touchedSupport && row.inBounceZone ? '터치중' : row.inBounceZone ? '진행' : '',
    ]
      .filter(Boolean)
      .join(' · ');
    const facePack = formatZoneFacePrice({
      nameKo,
      mid: midPx,
      priceOnly: false,
      signalKo: signalKo || undefined,
    });

    out.push({
      id: `merged-desk-mtf-dump-bounce1-${tf}`,
      kind: 'zone',
      label: nameKo,
      zoneFaceBase: nameKo,
      zoneFaceSignal: facePack.signal,
      x1: 0,
      y1: 0,
      x2: 1,
      y2: 1,
      time1: params.time1,
      time2: params.time2,
      price1: top,
      price2: sup,
      confidence: 70 + Math.min(14, timeframeRank(tf)) + (active ? 8 : 0),
      color: vis.fill,
      zoneFillPreserve: true,
      structureBias: 'bullish',
      overlayZoneExtraClass: [
        'merged-desk-mtf-dump-zone',
        'merged-desk-mtf-dump-bounce1-zone',
        vis.lifeClass,
        vis.setClass,
        `merged-desk-mtf-dump-tf-${tf}`,
        'merged-desk-pill-zone',
        'merged-desk-zone-label-on',
        active ? 'merged-desk-mtf-dump-bounce1-active' : 'merged-desk-mtf-dump-bounce1-idle',
        dim ? 'merged-desk-mtf-dump-set-dim' : '',
      ]
        .filter(Boolean)
        .join(' '),
      labelTooltip: `${row.lineKo}\n지지 ${Math.round(sup)} → 반등컷 ${Math.round(top)}${
        floorSpec?.touchTipKo ? `\n${floorSpec.touchTipKo}` : ''
      } · 조건부·한도 보장 아님`,
      labelBackgroundColor: vis.labelBg,
      labelTextColor: vis.labelFg,
      noProject: true,
    });
  }
  return out;
}

/** TF별 반등컷 가격선 — 세트 동일색 + 확률 */
export function buildMtfDumpBounce1PriceLines(params: {
  pack: MtfDumpBounceTargetPack;
  pathScenarioKo?: string;
}): AtlasPulsePriceLine[] {
  const rows = params.pack.rows ?? [];
  if (!rows.length) return [];
  const activeTf = params.pack.activeRow
    ? normalizeChartTimeframe(params.pack.activeRow.sourceTf)
    : '';
  const lines: AtlasPulsePriceLine[] = [];
  for (const row of rows) {
    const top = row.bounce1Px;
    if (top == null || !(top > 0)) continue;
    const active =
      row.inBounceZone ||
      row.touchedSupport ||
      (params.pathScenarioKo === '반등진행' &&
        normalizeChartTimeframe(row.sourceTf) === activeTf);
    if (!active && params.pathScenarioKo === '반등진행') continue;
    if (!active && !row.inBounceZone && !row.touchedSupport) continue;
    const vis = dumpTfSetRoleVisual({
      tf: row.sourceTf,
      role: 'bounce1',
      active: true,
    });
    const pct =
      row.reachPct != null ? `·${Math.round(row.reachPct)}%` : row.gapPct != null ? `·+${row.gapPct}%` : '';
    lines.push({
      price: top,
      color: vis.line,
      title: `${row.sourceTfKo}반등컷 ${Math.round(top)}${pct}`.slice(0, 26),
      lineWidth: active ? 2 : 1,
      lineStyle: 'dashed',
      axisLabel: true,
    });
  }
  return lines;
}
