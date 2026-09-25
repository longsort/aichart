/**
 * 파랑빨강띠 ↔ 학파 도식 — 반등/저항 면 + 다음 핫스팟 미래경로.
 * 교재 도식 Y비율을 통로(또는 WK TR)에 투영. 확정 경로·승률 아님.
 */
import type { Candle, OverlayItem } from '@/types';
import type { MergedDeskChannelGeom } from '@/lib/mergedDeskBlueRedChannels';
import { mergedDeskBarStepSec, mergedDeskRbFutureTime2 } from '@/lib/mergedDeskBlueRedChannels';
import { MERGED_DESK_RB_FUTURE_BARS } from '@/lib/mergedDeskSharedChartView';
import type { MergedDeskWyckoffRead } from '@/lib/mergedDeskWyckoffCycle';
import type { MergedDeskElliottRead } from '@/lib/mergedDeskElliottWave';
import {
  listSchoolHotspots,
  type SchoolSchematicPin,
} from '@/lib/mergedDeskSchoolSchematicCatalog';
import { schematicHotspotLabelKo } from '@/lib/mergedDeskSchematicShapeMatch';
import { buildSchematicSpotRoom } from '@/lib/mergedDeskSchematicSpotRoom';
import type { MergedDeskRbChipConfluence } from '@/lib/mergedDeskRbChipConfluence';

export type MergedDeskRbSchematicChartDraw = {
  overlays: OverlayItem[];
  summaryKo: string;
};

function atrApprox(candles: Candle[]): number {
  const n = candles.length;
  const last = Number(candles[n - 1]?.close) || 0;
  if (n < 5) return last > 0 ? last * 0.006 : 1;
  let s = 0;
  let c = 0;
  for (let i = Math.max(1, n - 14); i < n; i++) {
    const h = Number(candles[i]!.high);
    const l = Number(candles[i]!.low);
    const pc = Number(candles[i - 1]!.close);
    if (![h, l, pc].every((x) => Number.isFinite(x) && x > 0)) continue;
    s += Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
    c += 1;
  }
  return c > 0 ? s / c : last * 0.006;
}

function snapToRail(px: number, hi: number, lo: number): number {
  if (!(hi > lo) || !(px > 0)) return px;
  const mid = (hi + lo) / 2;
  const w = hi - lo;
  if (Math.abs(px - hi) <= w * 0.22) return hi;
  if (Math.abs(px - lo) <= w * 0.22) return lo;
  if (Math.abs(px - mid) <= w * 0.08) return mid;
  return px;
}

function mapTopToPrice(top: number, tops: number[], hiP: number, loP: number): number {
  const loTop = Math.max(...tops);
  const hiTop = Math.min(...tops);
  const span = loTop - hiTop || 1;
  const t = Math.max(0, Math.min(1, (top - hiTop) / span));
  return hiP - t * (hiP - loP);
}

function thinBand(mid: number, atr: number, span: number): { lo: number; hi: number } {
  const h = Math.max(atr * 0.12, Math.abs(mid) * 0.00035, span * 0.04);
  return { lo: mid - h / 2, hi: mid + h / 2 };
}

export function buildMergedDeskRbSchematicChartDraw(params: {
  candles: Candle[];
  timeframe: string;
  geoms?: MergedDeskChannelGeom[] | null;
  wyckoff?: MergedDeskWyckoffRead | null;
  elliott?: MergedDeskElliottRead | null;
  pin?: SchoolSchematicPin | null;
  chip?: MergedDeskRbChipConfluence | null;
  /** ENTER+진입허용일 때만 미래경로. 반등/저항 면은 유지 */
  showPath?: boolean;
}): MergedDeskRbSchematicChartDraw {
  const empty = { overlays: [] as OverlayItem[], summaryKo: '' };
  const { candles } = params;
  const pin = params.pin ?? params.chip?.topPin ?? null;
  const n = candles.length;
  if (n < 12 || !pin?.figureId) return empty;

  const g = params.geoms?.find((x) => x.primary) ?? params.geoms?.[0] ?? null;
  const wk = params.wyckoff;
  const last = Number(candles[n - 1]!.close);
  const tLast = Number(candles[n - 1]!.time);
  if (!(last > 0) || !(tLast > 0)) return empty;

  let hiP = g && g.tipUpper > g.tipLower ? g.tipUpper : wk?.resist ?? 0;
  let loP = g && g.tipUpper > g.tipLower ? g.tipLower : wk?.support ?? 0;
  if (!(hiP > loP)) {
    const atr0 = atrApprox(candles);
    hiP = last + atr0 * 2.2;
    loP = last - atr0 * 2.2;
  }
  hiP = snapToRail(hiP, g?.tipUpper ?? hiP, g?.tipLower ?? loP);
  loP = snapToRail(loP, g?.tipUpper ?? hiP, g?.tipLower ?? loP);
  if (!(hiP > loP)) return empty;

  const atr = atrApprox(candles);
  const span = hiP - loP;
  const t2 = mergedDeskRbFutureTime2(candles, tLast, n - 1, MERGED_DESK_RB_FUTURE_BARS);
  const school = pin.school;
  const spots = listSchoolHotspots(school, pin.figureId);
  const tops = spots.length ? spots.map((s) => s.top) : [78, 22];
  const nowKey = String(pin.hotspotKey || '');
  let nowIdx = spots.findIndex((s) => s.key === nowKey);
  if (nowIdx < 0) nowIdx = Math.max(0, Math.floor(spots.length * 0.55));

  const room = buildSchematicSpotRoom({
    last,
    pin,
    wyckoff: wk,
    elliott: params.elliott,
    hotspotKey: nowKey || spots[nowIdx]?.key,
  });
  const bouncePx = snapToRail(
    params.chip?.bouncePx ?? room?.down?.price ?? pin.dumpTo ?? loP,
    hiP,
    loP
  );
  const resistPx = snapToRail(
    params.chip?.resistPx ?? room?.up?.price ?? pin.bounceTo ?? hiP,
    hiP,
    loP
  );
  const chipNames = params.chip?.top.map((h) => h.tagKo).filter(Boolean).join('·') || '';
  const overlays: OverlayItem[] = [];

  const bounceBand = thinBand(bouncePx, atr, span);
  overlays.push({
    id: 'merged-desk-rb-schematic-bounce-zone',
    kind: 'zone',
    category: 'chartPrimeTrendChannels',
    label: '도식반등',
    zoneFaceBase: '도식반등',
    zoneFaceSignal: /distribution|markdown/i.test(pin.figureId) ? 'PSY' : 'Spring',
    zoneFaceDetailKo: [
      '도식 하단 · 반등 참고자리',
      chipNames ? `칩일치 ${chipNames}` : room?.down?.ko || 'TR지지',
      '확정 경로·승률 아님',
    ].join('\n'),
    zoneFaceLang: 'ko',
    x1: 0,
    y1: 0.5,
    x2: 1,
    y2: 0.5,
    time1: Number(candles[Math.max(0, n - 8)]!.time),
    time2: t2,
    price1: bounceBand.hi,
    price2: bounceBand.lo,
    confidence: 78,
    color: 'rgba(34,197,94,0.22)',
    zoneFillPreserve: true,
    zoneSpanOnly: true,
    structureBias: 'bullish',
    overlayZoneExtraClass: [
      'merged-desk-rb-channel merged-desk-rb-schematic-face merged-desk-rb-schematic-bounce merged-desk-rb-ai-face',
      params.showPath === false ? 'merged-desk-rb-schematic-wait' : '',
    ]
      .filter(Boolean)
      .join(' '),
    labelTooltip: '도식 반등자리 · 파랑빨강띠 하단 합류 · 확정 아님',
    labelBackgroundColor: 'rgba(20,83,45,0.94)',
    labelTextColor: '#ecfdf5',
    noProject: true,
  });

  const resistBand = thinBand(resistPx, atr, span);
  overlays.push({
    id: 'merged-desk-rb-schematic-resist-zone',
    kind: 'zone',
    category: 'chartPrimeTrendChannels',
    label: '도식저항',
    zoneFaceBase: '도식저항',
    zoneFaceSignal: /distribution|markdown/i.test(pin.figureId) ? 'UT' : 'SOS',
    zoneFaceDetailKo: [
      '도식 상단 · 저항/UT 참고자리',
      chipNames ? `칩일치 ${chipNames}` : room?.up?.ko || 'TR저항',
      '확정 경로·승률 아님',
    ].join('\n'),
    zoneFaceLang: 'ko',
    x1: 0,
    y1: 0.5,
    x2: 1,
    y2: 0.5,
    time1: Number(candles[Math.max(0, n - 8)]!.time),
    time2: t2,
    price1: resistBand.hi,
    price2: resistBand.lo,
    confidence: 78,
    color: 'rgba(239,68,68,0.22)',
    zoneFillPreserve: true,
    zoneSpanOnly: true,
    structureBias: 'bearish',
    overlayZoneExtraClass: [
      'merged-desk-rb-channel merged-desk-rb-schematic-face merged-desk-rb-schematic-resist merged-desk-rb-ai-face',
      params.showPath === false ? 'merged-desk-rb-schematic-wait' : '',
    ]
      .filter(Boolean)
      .join(' '),
    labelTooltip: '도식 저항자리 · 파랑빨강띠 상단 합류 · 확정 아님',
    labelBackgroundColor: 'rgba(127,29,29,0.94)',
    labelTextColor: '#fef2f2',
    noProject: true,
  });

  if (Number.isFinite(pin.dumpTo) && Number(pin.dumpTo) > 0) {
    const dumpPx = snapToRail(Number(pin.dumpTo), hiP, loP);
    const dumpBand = thinBand(dumpPx, atr, span);
    overlays.push({
      id: 'merged-desk-rb-schematic-dump-zone',
      kind: 'supplyZone',
      category: 'chartPrimeTrendChannels',
      label: '폭락구간',
      zoneFaceBase: '폭락구간',
      zoneFaceSignal: 'DUMP',
      zoneFaceDetailKo: [
        '도식 폭락·마크다운 참고 구간',
        `목표 ${dumpPx.toFixed(dumpPx >= 100 ? 0 : 1)}`,
        '확정 경로·승률 아님',
      ].join('\n'),
      zoneFaceLang: 'ko',
      x1: 0,
      y1: 0.5,
      x2: 1,
      y2: 0.5,
      time1: Number(candles[Math.max(0, n - 12)]!.time),
      time2: t2,
      price1: dumpBand.hi,
      price2: dumpBand.lo,
      confidence: 74,
      color: 'rgba(248,113,113,0.24)',
      zoneFillPreserve: true,
      zoneSpanOnly: true,
      structureBias: 'bearish',
      overlayZoneExtraClass:
        'merged-desk-rb-channel merged-desk-rb-schematic-face merged-desk-rb-schematic-dump merged-desk-rb-ai-face',
      labelTooltip: '폭락구간 · 도식 dumpTo · 확정 아님',
      labelBackgroundColor: 'rgba(127,29,29,0.94)',
      labelTextColor: '#fef2f2',
      noProject: true,
    });
  }

  const futureSpots = spots.slice(Math.max(0, nowIdx));
  const pts: Array<{ t: number; p: number; key: string; label: string }> = [
    { t: tLast, p: last, key: 'NOW', label: '지금' },
  ];
  const barSec = mergedDeskBarStepSec(candles, n - 1);
  const ahead = futureSpots.filter((s) => s.key !== nowKey);
  const steps = Math.max(1, ahead.length);
  ahead.forEach((s, i) => {
    const t = tLast + barSec * MERGED_DESK_RB_FUTURE_BARS * ((i + 1) / steps);
    const p = mapTopToPrice(s.top, tops, hiP, loP);
    pts.push({
      t,
      p,
      key: s.key,
      label: schematicHotspotLabelKo(s.key),
    });
  });
  if (pts.length < 2 && Number.isFinite(pin.dumpTo)) {
    pts.push({
      t: t2,
      p: snapToRail(Number(pin.dumpTo), hiP, loP),
      key: 'DUMP',
      label: '목표',
    });
  }

  if (params.showPath === false) {
    const nextLab = pts[1]?.label || '다음자리';
    return {
      overlays,
      summaryKo: `${params.chip?.summaryKo ? `${params.chip.summaryKo} · ` : ''}도식면 · ENTER 전 경로숨김 · 반등 ${bouncePx.toFixed(0)} · 저항 ${resistPx.toFixed(0)} · 다음 ${nextLab}`,
    };
  }

  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]!;
    const b = pts[i + 1]!;
    const down = b.p < a.p;
    overlays.push({
      id: `merged-desk-rb-schematic-path-${i}`,
      kind: 'trendLine',
      category: 'chartPrimeTrendChannels',
      label: '',
      x1: 0,
      y1: 0,
      x2: 1,
      y2: 1,
      time1: a.t,
      time2: b.t,
      price1: a.p,
      price2: b.p,
      confidence: 72,
      color: down ? 'rgba(239,68,68,0.88)' : 'rgba(34,197,94,0.88)',
      lineStrokeWidth: 1.7,
      lineDash: '5 4',
      noProject: true,
      overlayZoneExtraClass:
        'merged-desk-rb-channel merged-desk-rb-schematic-path merged-desk-blue-red-channel',
      labelTooltip: `도식 미래경로 ${a.label}→${b.label} · 참고만 · 확정 아님`,
      structureBias: down ? 'bearish' : 'bullish',
    });
  }

  for (let i = 1; i < pts.length; i++) {
    const pt = pts[i]!;
    overlays.push({
      id: `merged-desk-rb-schematic-node-${pt.key}`,
      kind: 'label',
      category: 'chartPrimeTrendChannels',
      label: pt.label,
      x1: 0,
      y1: 0,
      time1: pt.t,
      price1: pt.p,
      confidence: 74,
      color: pt.p >= last ? '#f87171' : '#4ade80',
      labelBackgroundColor: pt.p >= last ? 'rgba(127,29,29,0.92)' : 'rgba(20,83,45,0.92)',
      labelTextColor: '#f8fafc',
      overlayZoneExtraClass: 'merged-desk-rb-schematic-node merged-desk-rb-channel',
      labelTooltip: `도식 ${pt.label} · 미래경로 참고 · 확정 아님`,
    });
  }

  const nextLab = pts[1]?.label || '다음자리';
  return {
    overlays,
    summaryKo: `${params.chip?.summaryKo ? `${params.chip.summaryKo} · ` : ''}도식경로 · 반등 ${bouncePx.toFixed(0)} · 저항 ${resistPx.toFixed(0)} · 다음 ${nextLab}`,
  };
}
