/**
 * Eagle1 zones → chart overlays. Formation time → last candle. No whale cards.
 */

import type { OverlayItem } from '@/types';
import type { Eagle1ChartMode } from './chartUx';
import type { Eagle1Zone, ZoneCluster, PocState } from './zoneEngine';
import { pocStateKo, zoneVisibleInDefaultUi } from './zoneEngine';
import type { ZoneReaction } from './zoneReaction';
import { zoneReactionKo } from './zoneReaction';
import { formatCompactZoneLabel } from './noFakeNumbers';
import { attachFunctionalOverlayLabel } from './chartUx';
import type { CoreZone, CoreZoneFusionReport } from './coreZoneFusionEngine';

function kindOf(z: Eagle1Zone): OverlayItem['kind'] {
  if (
    z.source_type === 'poc' ||
    z.source_type === 'vah' ||
    z.source_type === 'val' ||
    z.source_type === 'hvn' ||
    z.source_type === 'lvn' ||
    z.source_type === 'liquidity'
  ) {
    return 'keyLevel';
  }
  if (z.source_type === 'fvg') return 'fvg';
  if (z.source_type === 'ob' || z.source_type === 'breaker') return 'ob';
  if (z.source_type === 'bpr') return 'bprZone';
  if (z.bias === 'bullish' || z.source_type === 'demand') return 'demandZone';
  if (z.bias === 'bearish' || z.source_type === 'supply') return 'supplyZone';
  return 'zone';
}

function colorOf(z: Eagle1Zone): string {
  if (z.source_type === 'poc') return 'rgba(250,204,21,0.92)';
  if (z.source_type === 'vah') return 'rgba(248,113,113,0.78)';
  if (z.source_type === 'val') return 'rgba(52,211,153,0.78)';
  if (z.source_type === 'hvn') return 'rgba(250,204,21,0.55)';
  if (z.source_type === 'lvn') return 'rgba(148,163,184,0.7)';
  if (z.source_type === 'liquidity') {
    return z.bias === 'bullish' ? 'rgba(56,189,248,0.88)' : 'rgba(251,191,36,0.88)';
  }
  if (z.bias === 'bullish' || z.source_type === 'demand') return 'rgba(16,185,129,0.16)';
  if (z.bias === 'bearish' || z.source_type === 'supply') return 'rgba(244,63,94,0.16)';
  return 'rgba(148,163,184,0.12)';
}

function isHtfTf(tf: string): boolean {
  const t = String(tf || '').toUpperCase();
  return t === '4H' || t === '12H' || t === '1D' || t === '1W' || t === '1M' || t === 'D' || t === 'W' || t === 'M';
}

function labelOf(z: Eagle1Zone): string {
  const htf = isHtfTf(z.timeframe) ? 'HTF ' : '';
  if (z.source_type === 'poc') return '최다거래가격';
  if (z.source_type === 'ob') return z.bias === 'bullish' ? '핵심 매수구간' : '핵심 매도구간';
  if (z.source_type === 'fvg') return '가격빈틈';
  if (z.source_type === 'bpr') return '균형가격구간';
  if (z.source_type === 'breaker') return '돌파전환구간';
  if (z.source_type === 'demand') return `${htf}DEMAND ZONE`;
  if (z.source_type === 'supply') return `${htf}SUPPLY ZONE`;
  if (z.source_type === 'liquidity') return z.bias === 'bullish' ? 'LONG LIQUIDATION ZONE' : 'SHORT LIQUIDATION ZONE';
  if (z.source_type === 'hvn') return '고거래량';
  if (z.source_type === 'lvn') return '저거래량';
  if (z.source_type === 'vah') return '거래량상단';
  if (z.source_type === 'val') return '거래량하단';
  return z.reason.split('·')[0]!.trim();
}

function clusterCompact(c: ZoneCluster): string {
  const type =
    c.bias === 'bearish' ? 'HTF SUPPLY ZONE' : c.bias === 'bullish' ? 'HTF DEMAND ZONE' : '핵심 구간';
  return formatCompactZoneLabel({
    type,
    bias: c.bias === 'bearish' ? 'down' : c.bias === 'bullish' ? 'up' : 'neutral',
    sampleCount: c.sampleSize ?? 0,
    medianPct: null,
  });
}

function clusterFace(c: ZoneCluster, lastTime: number, id: string, reactionKo?: string | null): OverlayItem {
  const core = c.bias === 'bearish' ? 'HTF SUPPLY ZONE' : c.bias === 'bullish' ? 'HTF DEMAND ZONE' : '핵심 구간';
  const rx = reactionKo && reactionKo !== '데이터 없음' ? ` · ${reactionKo}` : '';
  const t0 = Math.min(...c.components.map((x) => x.created_at), lastTime);
  return attachFunctionalOverlayLabel({
    id,
    kind: c.bias === 'bearish' ? 'supplyZone' : 'demandZone',
    label: `${core}${rx}`,
    x1: 0,
    y1: 0,
    x2: 1,
    y2: 1,
    time1: t0,
    time2: lastTime,
    price1: c.upper,
    price2: c.lower,
    priceFrozen1: c.upper,
    priceFrozen2: c.lower,
    confidence: c.tier === 'S' ? 96 : c.tier === 'A' ? 82 : 70,
    color: c.bias === 'bearish' ? 'rgba(244,63,94,0.18)' : 'rgba(16,185,129,0.18)',
    category: 'zones',
    noProject: true,
    zoneFillPreserve: true,
    overlayZoneExtraClass: 'eagle1-zone eagle1-zone--cluster-face merged-desk-zone-label-on',
    zoneFaceBase: core,
    zoneFaceSignal: rx ? reactionKo || undefined : undefined,
    labelTooltip: `${clusterCompact(c)} · ${c.detail} · ${c.reactionLabel} · 클릭: 구간 설명`,
  });
}

function clusterEdgeLine(
  c: ZoneCluster,
  lastTime: number,
  id: string,
  edge: 'upper' | 'lower',
  reactionKo?: string | null
): OverlayItem {
  const core = c.bias === 'bearish' ? 'HTF SUPPLY ZONE' : c.bias === 'bullish' ? 'HTF DEMAND ZONE' : '핵심 구간';
  const price = edge === 'upper' ? c.upper : c.lower;
  const rx = reactionKo && reactionKo !== '데이터 없음' ? ` · ${reactionKo}` : '';
  return {
    id,
    kind: 'keyLevel',
    label: edge === 'upper' ? `${core} 상단${rx}` : `${core} 하단`,
    x1: 0,
    y1: 0,
    x2: 1,
    y2: 1,
    time1: Math.min(...c.components.map((x) => x.created_at)),
    time2: lastTime,
    price1: price,
    price2: price,
    priceFrozen1: price,
    priceFrozen2: price,
    confidence: c.tier === 'S' ? 90 : 70,
    color: c.bias === 'bearish' ? 'rgba(248,113,113,0.9)' : 'rgba(52,211,153,0.9)',
    category: 'zones',
    noProject: true,
    overlayZoneExtraClass: `eagle1-zone eagle1-zone--cluster-line`,
    labelTooltip: `${clusterCompact(c)} · ${c.detail} · ${c.reactionLabel} · 클릭: 가격선 설명`,
    zoneFaceBase: edge === 'upper' ? `${core} 상단` : `${core} 하단`,
  };
}

function toOverlay(z: Eagle1Zone, lastTime: number, id: string): OverlayItem {
  const level =
    z.source_type === 'poc' ||
    z.source_type === 'vah' ||
    z.source_type === 'val' ||
    z.source_type === 'hvn' ||
    z.source_type === 'lvn' ||
    z.source_type === 'liquidity';
  return {
    id,
    kind: kindOf(z),
    label: labelOf(z),
    x1: 0,
    y1: 0,
    x2: 1,
    y2: 1,
    time1: z.created_at,
    time2: lastTime,
    price1: level ? z.midpoint : z.upper,
    price2: level ? z.midpoint : z.lower,
    priceFrozen1: level ? z.midpoint : z.upper,
    priceFrozen2: level ? z.midpoint : z.lower,
    confidence: Math.round(z.strength * 100),
    color: colorOf(z),
    category: 'zones',
    noProject: true,
    overlayZoneExtraClass: `eagle1-zone eagle1-zone--${z.source_type}`,
    labelTooltip: `${z.reason} · 클릭: 구간 설명`,
    zoneFaceBase: labelOf(z),
  };
}

export function coreZoneToOverlay(
  core: CoreZone,
  lastTime: number,
  /** 가로폭 시작 — 없으면 생성시각(너무 짧으면 14일 폴백) */
  time1?: number
): OverlayItem {
  const support = core.side === 'SUPPORT';
  const color = support ? 'rgba(34,211,238,0.32)' : 'rgba(248,113,113,0.32)';
  const face = support
    ? `CORE 지지 ${core.sourceTimeframe}`
    : `CORE 저항 ${core.sourceTimeframe}`;
  const t1Raw = time1 ?? core.createdAt;
  const t1 =
    Number.isFinite(t1Raw) && t1Raw > 0 && t1Raw < lastTime
      ? t1Raw
      : Math.max(0, lastTime - 86400 * 14);
  return attachFunctionalOverlayLabel({
    id: `eagle1-core-${core.side.toLowerCase()}`,
    kind: support ? 'demandZone' : 'supplyZone',
    label: face,
    x1: 0,
    y1: 0,
    x2: 1,
    y2: 1,
    time1: t1,
    time2: lastTime,
    price1: core.upper,
    price2: core.lower,
    priceFrozen1: core.upper,
    priceFrozen2: core.lower,
    confidence: Math.max(78, core.score ?? 50),
    color,
    category: 'zones',
    noProject: true,
    overlayZoneExtraClass: `eagle1-zone eagle1-zone--core merged-desk-zone-caption-clean ${support ? 'eagle1-core-support' : 'eagle1-core-resist'}`,
    zoneFaceBase: face,
    labelTooltip: `${core.labelEn} · ${core.evidenceSources.join('+') || 'n/a'} · Setup점수≠승률`,
  });
}

export function aPlusZoneToOverlay(
  ap: {
    id: string;
    side: 'LONG' | 'SHORT';
    labelEn: string;
    labelKo: string;
    lower: number;
    upper: number;
    createdAt?: number;
    setupScore?: number | null;
    strategyTypes?: string[];
  },
  lastTime: number,
  time1?: number
): OverlayItem {
  const long = ap.side === 'LONG';
  const face = long ? 'A+ 롱존' : 'A+ 숏존';
  const t1Raw = time1 ?? ap.createdAt ?? lastTime;
  const t1 =
    Number.isFinite(t1Raw) && t1Raw > 0 && t1Raw < lastTime
      ? t1Raw
      : Math.max(0, lastTime - 86400 * 14);
  return attachFunctionalOverlayLabel({
    id: `eagle1-aplus-${ap.side.toLowerCase()}`,
    kind: long ? 'demandZone' : 'supplyZone',
    label: face,
    x1: 0,
    y1: 0,
    x2: 1,
    y2: 1,
    time1: t1,
    time2: lastTime,
    price1: ap.upper,
    price2: ap.lower,
    priceFrozen1: ap.upper,
    priceFrozen2: ap.lower,
    confidence: Math.max(82, ap.setupScore ?? 70),
    color: long ? 'rgba(52,211,153,0.38)' : 'rgba(251,113,133,0.38)',
    category: 'zones',
    noProject: true,
    overlayZoneExtraClass: `eagle1-zone eagle1-zone--aplus merged-desk-zone-caption-clean ${long ? 'eagle1-aplus-long' : 'eagle1-aplus-short'}`,
    zoneFaceBase: face,
    labelTooltip: `${ap.labelEn} · ${(ap.strategyTypes || []).join('+') || 'fusion'} · Setup≠승률`,
  });
}

export function coreZoneFusionToOverlays(
  report: CoreZoneFusionReport | null | undefined,
  lastTime: number,
  time1?: number
): OverlayItem[] {
  if (!(lastTime > 0)) return [];
  const list =
    report?.practical?.length
      ? report.practical
      : ([report?.support, report?.resistance].filter(Boolean) as CoreZone[]);
  if (!list.length) return [];
  return list.map((z) => coreZoneToOverlay(z, lastTime, time1));
}

export function eagle1ZonesToOverlays(params: {
  zones?: Eagle1Zone[] | null;
  clusters?: ZoneCluster[] | null;
  recommended?: ZoneCluster | null;
  displaySupport?: ZoneCluster[] | null;
  displayResist?: ZoneCluster[] | null;
  coreZoneFusion?: CoreZoneFusionReport | null;
  lastTime: number;
  mode: Eagle1ChartMode;
  pocState?: PocState | null;
  reaction?: ZoneReaction | null;
}): OverlayItem[] {
  const lastTime = params.lastTime;
  if (!(lastTime > 0)) return [];
  const mode = params.mode || 'practical';
  const zones = params.zones ?? [];
  const out: OverlayItem[] = [];

  if (mode === 'practical') {
    const coreOvs = coreZoneFusionToOverlays(params.coreZoneFusion, lastTime);
    if (coreOvs.length) {
      out.push(...coreOvs);
      const poc = zones.find((z) => z.source_type === 'poc' && zoneVisibleInDefaultUi(z));
      if (poc) {
        out.push({
          id: 'eagle1-poc-line',
          kind: 'keyLevel',
          label: params.pocState ? `최다거래가격 · ${pocStateKo(params.pocState)}` : '최다거래가격',
          x1: 0,
          y1: 0,
          x2: 1,
          y2: 1,
          time1: poc.created_at,
          time2: lastTime,
          price1: poc.midpoint,
          price2: poc.midpoint,
          priceFrozen1: poc.midpoint,
          priceFrozen2: poc.midpoint,
          confidence: 90,
          color: 'rgba(250,204,21,0.92)',
          category: 'zones',
          noProject: true,
          overlayZoneExtraClass: 'eagle1-zone eagle1-zone--poc-line',
          zoneFaceBase: '최다거래가격',
          labelTooltip: '최다거래가격 · 클릭: 구간 설명 · 확률 단정 아님',
        });
      }
      return out;
    }
    const poc = zones.find((z) => z.source_type === 'poc' && zoneVisibleInDefaultUi(z));
    if (poc) {
      out.push({
        id: 'eagle1-poc-line',
        kind: 'keyLevel',
        label: params.pocState ? `최다거래가격 · ${pocStateKo(params.pocState)}` : '최다거래가격',
        x1: 0,
        y1: 0,
        x2: 1,
        y2: 1,
        time1: poc.created_at,
        time2: lastTime,
        price1: poc.midpoint,
        price2: poc.midpoint,
        priceFrozen1: poc.midpoint,
        priceFrozen2: poc.midpoint,
        confidence: 90,
        color: 'rgba(250,204,21,0.92)',
        category: 'zones',
        noProject: true,
        overlayZoneExtraClass: 'eagle1-zone eagle1-zone--poc-line',
        zoneFaceBase: '최다거래가격',
        labelTooltip: '최다거래가격 · 클릭: 구간 설명 · 확률 단정 아님',
      });
    }
    const rec = params.recommended;
    const recIsPocOnly = rec != null && rec.sources.length === 1 && rec.sources[0] === 'poc';
    if (rec && !recIsPocOnly) {
      const rxKo = zoneReactionKo(params.reaction);
      out.push(clusterFace(rec, lastTime, 'eagle1-cluster-main-face', rxKo));
      out.push(clusterEdgeLine(rec, lastTime, 'eagle1-cluster-main-upper', 'upper', rxKo));
      out.push(clusterEdgeLine(rec, lastTime, 'eagle1-cluster-main-lower', 'lower', rxKo));
    }
    const skipId = rec && !recIsPocOnly ? rec.cluster_id : '';
    (params.displaySupport ?? []).forEach((c, i) => {
      if (c.cluster_id === skipId) return;
      out.push(clusterFace(c, lastTime, `eagle1-cluster-sup-${i}`));
    });
    (params.displayResist ?? []).forEach((c, i) => {
      if (c.cluster_id === skipId) return;
      out.push(clusterFace(c, lastTime, `eagle1-cluster-res-${i}`));
    });
    return out;
  }

  const live = zones.filter((z) =>
    mode === 'research' ? z.status !== 'DELETED' : zoneVisibleInDefaultUi(z)
  );
  const liq = live.filter((z) => z.source_type === 'liquidity');
  const rest = live.filter((z) => z.source_type !== 'liquidity');
  const ranked = [...rest].sort((a, b) => {
    const ta = a.tier === 'S' ? 0 : a.tier === 'A' ? 1 : a.tier === 'B' ? 2 : 3;
    const tb = b.tier === 'S' ? 0 : b.tier === 'A' ? 1 : b.tier === 'B' ? 2 : 3;
    return ta - tb;
  });
  const cap = mode === 'research' ? ranked : ranked.slice(0, 10);
  const liqPick =
    mode === 'research'
      ? liq
      : [
          ...liq.filter((z) => z.bias === 'bearish').slice(-1),
          ...liq.filter((z) => z.bias === 'bullish').slice(-1),
        ];
  for (const z of [...cap, ...liqPick]) {
    const prefix =
      z.source_type === 'poc'
        ? 'eagle1-poc'
        : z.source_type === 'ob'
          ? 'eagle1-ob'
          : z.source_type === 'fvg'
            ? 'eagle1-fvg'
            : z.source_type === 'bpr'
              ? 'eagle1-bpr'
              : z.source_type === 'breaker'
                ? 'eagle1-breaker'
                : z.source_type === 'liquidity'
                  ? 'eagle1-liq'
                  : `eagle1-${z.source_type}`;
    out.push(toOverlay(z, lastTime, `${prefix}-${z.zone_id.replace(/[^a-zA-Z0-9:_-]/g, '')}`));
  }
  return out;
}

/** ChartView가 나중에 주입하는 eagle1 오버레이를 데스크 HUD에서 다시 찾는다. */
export function overlayFromEagle1ZoneId(params: {
  id: string;
  lastTime: number;
  mode?: Eagle1ChartMode;
  pack: {
    zones?: Eagle1Zone[] | null;
    clusters?: ZoneCluster[] | null;
    recommended?: ZoneCluster | null;
    displaySupport?: ZoneCluster[] | null;
    displayResist?: ZoneCluster[] | null;
    pocState?: PocState | null;
    reaction?: ZoneReaction | null;
  };
}): OverlayItem | null {
  const id = String(params.id || '');
  if (!id.startsWith('eagle1-')) return null;
  const lastTime = params.lastTime > 0 ? params.lastTime : Date.now();
  const list = eagle1ZonesToOverlays({
    zones: params.pack.zones,
    clusters: params.pack.clusters,
    recommended: params.pack.recommended,
    displaySupport: params.pack.displaySupport,
    displayResist: params.pack.displayResist,
    lastTime,
    mode: params.mode || 'practical',
    pocState: params.pack.pocState,
    reaction: params.pack.reaction,
  });
  return list.find((o) => o.id === id) ?? list.find((o) => id.startsWith(o.id) || o.id.startsWith(id)) ?? null;
}
