/**
 * Structure desk chart drawings — mockup labels, max 2 support / 2 resist.
 * Confirmed zone prices stay frozen (passed through cluster bounds).
 */
import type { OverlayItem } from '@/types';
import type { StructureEvent } from './structureEngine';
import type { ZoneCluster, PocState } from './zoneEngine';
import { pocStateKo } from './zoneEngine';
import type { Eagle1SmartPath } from './smartPath';
import type { FrozenTrade } from './tradeManage';
import type { CandleEventMark } from './candleEventEngine';
import { eagle1PathSegments, attachFunctionalOverlayLabel } from './chartUx';
import { lastSweepLiquidity } from './structureEngine';
import { heatBarRgba } from './pressureHeatmap';

function levelLine(params: {
  id: string;
  label: string;
  price: number;
  lastTime: number;
  t0: number;
  color: string;
  dash?: string;
  extraClass?: string;
  kind?: OverlayItem['kind'];
}): OverlayItem {
  return {
    id: params.id,
    kind: params.kind ?? 'keyLevel',
    label: params.label,
    x1: 0,
    y1: 0,
    x2: 1,
    y2: 1,
    time1: params.t0,
    time2: params.lastTime,
    price1: params.price,
    price2: params.price,
    priceFrozen1: params.price,
    priceFrozen2: params.price,
    confidence: 82,
    color: params.color,
    lineDash: params.dash,
    lineStrokeWidth: 1,
    noProject: true,
    category: 'structure',
    overlayZoneExtraClass: params.extraClass || 'eagle1-zone eagle1-zone--liq',
    zoneFaceBase: params.label,
  };
}

function eventLabel(ev: StructureEvent): string {
  if (ev.kind === 'SWEEP') return ev.bias === 'bullish' ? 'SSL Sweep' : 'BSL Sweep';
  if (ev.kind === 'CHOCH') return ev.bias === 'bullish' ? 'Bullish CHOCH' : 'Bearish CHOCH';
  if (ev.kind === 'BOS') return ev.bias === 'bullish' ? 'BOS ↑' : 'BOS ↓';
  if (ev.kind === 'FAILED_BREAK') return ev.bias === 'bearish' ? 'FAKE BREAKOUT' : 'FAKE BREAKDOWN';
  return ev.kind;
}

export function buildStructureDeskOverlays(params: {
  lastTime: number;
  candles: Array<{ time: number; open?: number; high?: number; low?: number; close?: number }>;
  events?: StructureEvent[] | null;
  equalHighs?: number[] | null;
  equalLows?: number[] | null;
  displaySupport?: ZoneCluster[] | null;
  displayResist?: ZoneCluster[] | null;
  poc?: number | null;
  pocState?: PocState | null;
  smartPath?: Eagle1SmartPath | null;
  trade?: FrozenTrade | null;
  candleEvents?: CandleEventMark[] | null;
  entryLow?: number | null;
  entryHigh?: number | null;
  direction?: 'LONG' | 'SHORT' | null;
  heat?: Array<{ time: number; score: number }> | null;
  entryZoneState?: string | null;
  rangePressure?: Array<{ price: number; intensity: number; side: 'buy' | 'sell' | 'poc' }> | null;
}): OverlayItem[] {
  const lastTime = params.lastTime;
  if (!(lastTime > 0)) return [];
  const candles = params.candles ?? [];
  const t0 = Number(candles[0]?.time) || lastTime;
  const out: OverlayItem[] = [];
  const byTime = new Map(candles.map((c, i) => [Number(c.time), i]));
  for (const h of (params.heat ?? []).slice(-48)) {
    const i = byTime.get(Number(h.time));
    if (i == null) continue;
    const bar = candles[i]!;
    const next = candles[i + 1];
    const hi = Number(bar.high ?? bar.close ?? bar.open);
    const lo = Number(bar.low ?? bar.close ?? bar.open);
    const t1 = Number(bar.time);
    const t2 = Number(next?.time ?? t1 + 1);
    if (!(hi > lo) || !(t1 > 0) || t2 <= t1) continue;
    out.push({
      id: `eagle1-heat-${t1}`,
      kind: h.score >= 0 ? 'demandZone' : 'supplyZone',
      label: '',
      x1: 0,
      y1: 0,
      x2: 1,
      y2: 1,
      time1: t1,
      time2: t2,
      price1: hi,
      price2: lo,
      priceFrozen1: hi,
      priceFrozen2: lo,
      confidence: 40,
      color: heatBarRgba(h.score),
      category: 'structure',
      noProject: true,
      zoneFillPreserve: true,
      overlayZoneExtraClass: 'eagle1-zone eagle1-zone--heat',
    });
  }

  const eqh = params.equalHighs?.slice(-1)[0];
  const eql = params.equalLows?.slice(-1)[0];
  if (eqh != null && Number.isFinite(eqh)) {
    out.push(
      levelLine({
        id: 'eagle1-eqh',
        label: 'EQH (유동성)',
        price: eqh,
        lastTime,
        t0,
        color: 'rgba(248,113,113,0.92)',
        dash: '5 4',
        extraClass: 'eagle1-zone eagle1-zone--eqh',
        kind: 'eqh',
      })
    );
  }
  if (eql != null && Number.isFinite(eql)) {
    out.push(
      levelLine({
        id: 'eagle1-eql',
        label: 'EQL (유동성)',
        price: eql,
        lastTime,
        t0,
        color: 'rgba(226,232,240,0.88)',
        dash: '5 4',
        extraClass: 'eagle1-zone eagle1-zone--eql',
        kind: 'eql',
      })
    );
  }
  const liq = lastSweepLiquidity(params.events);
  if (liq.ssl != null && Number.isFinite(liq.ssl) && (eql == null || Math.abs(liq.ssl - eql) > 1e-8)) {
    out.push(
      levelLine({
        id: 'eagle1-ssl',
        label: 'SSL',
        price: liq.ssl,
        lastTime,
        t0,
        color: 'rgba(56,189,248,0.92)',
        dash: '4 4',
        extraClass: 'eagle1-zone eagle1-zone--ssl',
        kind: 'keyLevel',
      })
    );
  }
  if (liq.bsl != null && Number.isFinite(liq.bsl) && (eqh == null || Math.abs(liq.bsl - eqh) > 1e-8)) {
    out.push(
      levelLine({
        id: 'eagle1-bsl',
        label: 'BSL',
        price: liq.bsl,
        lastTime,
        t0,
        color: 'rgba(251,113,133,0.92)',
        dash: '4 4',
        extraClass: 'eagle1-zone eagle1-zone--bsl',
        kind: 'keyLevel',
      })
    );
  }

  if (params.poc != null && Number.isFinite(params.poc)) {
    out.push(
      levelLine({
        id: 'eagle1-poc-line',
        label: params.pocState ? `POC · ${pocStateKo(params.pocState)}` : 'POC',
        price: params.poc,
        lastTime,
        t0,
        color: 'rgba(34,211,238,0.95)',
        extraClass: 'eagle1-zone eagle1-zone--poc-line',
      })
    );
  }

  (params.displayResist ?? []).slice(0, 2).forEach((c, i) => {
    const formed = Math.min(...c.components.map((z) => z.created_at), lastTime);
    out.push(
      attachFunctionalOverlayLabel({
        id: `eagle1-cluster-res-${i}`,
        kind: 'supplyZone',
        label: 'CORE RESISTANCE (Unified)',
        x1: 0,
        y1: 0,
        x2: 1,
        y2: 1,
        time1: formed,
        time2: lastTime,
        price1: c.upper,
        price2: c.lower,
        priceFrozen1: c.upper,
        priceFrozen2: c.lower,
        confidence: c.tier === 'S' ? 96 : 82,
        color: 'rgba(239,68,68,0.16)',
        category: 'zones',
        noProject: true,
        zoneFillPreserve: true,
        overlayZoneExtraClass: 'eagle1-zone eagle1-zone--unified-res eagle1-hud-keep merged-desk-zone-label-on',
        zoneFaceBase: 'CORE RESISTANCE',
        zoneFaceSignal: 'Unified Zone',
        labelTooltip: c.detail || 'Unified Resistance',
      })
    );
  });
  (params.displaySupport ?? []).slice(0, 2).forEach((c, i) => {
    const formed = Math.min(...c.components.map((z) => z.created_at), lastTime);
    out.push(
      attachFunctionalOverlayLabel({
        id: `eagle1-cluster-sup-${i}`,
        kind: 'demandZone',
        label: 'CORE SUPPORT (Unified)',
        x1: 0,
        y1: 0,
        x2: 1,
        y2: 1,
        time1: formed,
        time2: lastTime,
        price1: c.upper,
        price2: c.lower,
        priceFrozen1: c.upper,
        priceFrozen2: c.lower,
        confidence: c.tier === 'S' ? 96 : 82,
        color: 'rgba(34,197,94,0.18)',
        category: 'zones',
        noProject: true,
        zoneFillPreserve: true,
        overlayZoneExtraClass: 'eagle1-zone eagle1-zone--unified-sup eagle1-hud-keep merged-desk-zone-label-on',
        zoneFaceBase: 'CORE SUPPORT',
        zoneFaceSignal: 'Unified Zone',
        labelTooltip: c.detail || 'Unified Support',
      })
    );
  });

  const eLo = params.entryLow;
  const eHi = params.entryHigh;
  if (
    params.direction &&
    eLo != null &&
    eHi != null &&
    Number.isFinite(eLo) &&
    Number.isFinite(eHi) &&
    eHi > eLo
  ) {
    const long = params.direction === 'LONG';
    const st = String(params.entryZoneState || 'WAIT').toLowerCase();
    out.push(
      attachFunctionalOverlayLabel({
        id: 'eagle1-entry-zone',
        kind: long ? 'demandZone' : 'supplyZone',
        label: 'ENTRY',
        x1: 0,
        y1: 0,
        x2: 1,
        y2: 1,
        time1: Number(candles[Math.max(0, candles.length - 24)]?.time) || t0,
        time2: lastTime,
        price1: eHi,
        price2: eLo,
        priceFrozen1: eHi,
        priceFrozen2: eLo,
        confidence: 88,
        color: long ? 'rgba(34,197,94,0.14)' : 'rgba(239,68,68,0.14)',
        lineDash: '6 4',
        category: 'entry',
        noProject: true,
        zoneFillPreserve: true,
        overlayZoneExtraClass: `eagle1-zone eagle1-zone--entry eagle1-zone--entry-${st} eagle1-hud-keep merged-desk-zone-label-on`,
        zoneFaceBase: 'ENTRY',
        zoneFaceSignal: long ? 'LONG' : 'SHORT',
        labelTooltip: `메인 진입구간 · ${params.entryZoneState || 'WAIT'}`,
      })
    );
  }

  const live = (params.events ?? []).filter((e) => e.kind !== 'SWING');
  const pick: StructureEvent[] = [];
  const lastBos = [...live].reverse().find((e) => e.kind === 'BOS');
  const lastChoch = [...live].reverse().find((e) => e.kind === 'CHOCH');
  const lastSweep = [...live].reverse().find((e) => e.kind === 'SWEEP');
  const lastFail = [...live].reverse().find((e) => e.kind === 'FAILED_BREAK');
  if (lastChoch) pick.push(lastChoch);
  if (lastBos && lastBos.index !== lastChoch?.index) pick.push(lastBos);
  if (lastSweep) pick.push(lastSweep);
  if (lastFail) pick.push(lastFail);
  const seen = new Set<string>();
  for (const ev of pick) {
    const id = `eagle1-${ev.kind.toLowerCase()}-${ev.known_at}-${ev.index}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const evIdx = Number.isFinite(ev.known_at) ? ev.known_at : ev.index;
    const t1 = Number(candles[evIdx]?.time ?? candles[ev.index]?.time ?? lastTime);
    const t2 = Number(candles[Math.min(candles.length - 1, evIdx + 3)]?.time ?? lastTime);
    const color =
      ev.kind === 'SWEEP'
        ? 'rgba(250,204,21,0.92)'
        : ev.kind === 'FAILED_BREAK'
          ? 'rgba(248,113,113,0.92)'
          : ev.bias === 'bullish'
            ? 'rgba(52,211,153,0.95)'
            : 'rgba(248,113,113,0.95)';
    out.push({
      id,
      kind: ev.kind === 'CHOCH' ? 'choch' : ev.kind === 'SWEEP' ? 'liquiditySweep' : ev.kind === 'FAILED_BREAK' ? 'falseBreakout' : 'bos',
      label: eventLabel(ev),
      x1: 0,
      y1: 0,
      x2: 1,
      y2: 1,
      time1: t1,
      time2: t2 > t1 ? t2 : lastTime,
      price1: ev.level,
      price2: ev.level,
      priceFrozen1: ev.level,
      priceFrozen2: ev.level,
      confidence: 74,
      color,
      lineStrokeWidth: 1.4,
      category: 'structure',
      structureBias: ev.bias,
      noProject: true,
      overlayZoneExtraClass: 'eagle1-structure eagle1-structure-mark',
      labelTooltip: ev.evidence.join(' · ') || eventLabel(ev),
    });
  }

  const seenEvt = new Set<string>();
  for (const ev of params.candleEvents ?? []) {
    if (!(ev.time > 0) || !Number.isFinite(ev.price)) continue;
    if (ev.kind === 'SWEEP' || ev.kind === 'CHOCH' || ev.kind === 'BOS' || ev.kind === 'FAKE_BREAK') continue;
    const key = `${ev.index}:${ev.kind}`;
    if (seenEvt.has(key)) continue;
    seenEvt.add(key);
    out.push({
      id: `eagle1-evt-${ev.kind}-${ev.index}`,
      kind: ev.kind === 'SWEEP' ? 'liquiditySweep' : ev.kind === 'FAKE_BREAK' ? 'falseBreakout' : ev.kind === 'CHOCH' ? 'choch' : 'bos',
      label: ev.icon,
      x1: 0,
      y1: 0,
      x2: 1,
      y2: 1,
      time1: ev.time,
      price1: ev.price,
      priceFrozen1: ev.price,
      confidence: ev.confirmed ? 80 : 55,
      color:
        ev.kind === 'FAKE_BREAK'
          ? 'rgba(248,113,113,0.95)'
          : ev.kind === 'SWEEP'
            ? 'rgba(167,139,250,0.95)'
            : ev.kind === 'IMPULSE'
              ? 'rgba(250,204,21,0.95)'
              : ev.bias === 'bearish'
                ? 'rgba(248,113,113,0.92)'
                : 'rgba(34,197,94,0.95)',
      category: 'structure',
      noProject: true,
      overlayZoneExtraClass: `eagle1-candle-event eagle1-candle-event--${ev.kind.toLowerCase()} eagle1-hud-keep`,
      labelTooltip: `${ev.labelKo}${ev.confirmed ? '' : ' · 미확정'}`,
    });
  }

  const segs = eagle1PathSegments(params.trade, params.smartPath);
  for (const s of segs) {
    out.push({
      id: s.id,
      kind: 'trendLine',
      label: s.label,
      x1: 0,
      y1: 0,
      x2: 1,
      y2: 1,
      time1: s.time1,
      price1: s.price1,
      time2: s.time2,
      price2: s.price2,
      confidence: 70,
      color: s.color,
      lineDash: s.dashed ? '6 5' : undefined,
      lineStrokeWidth: 1.5,
      noProject: true,
      category: 'scenario',
      overlayZoneExtraClass: s.arrowHead
        ? 'eagle1-zone eagle1-zone--path eagle1-path-arrow'
        : 'eagle1-zone eagle1-zone--path',
    });
  }

  const vpT0 = Number(candles[Math.max(0, candles.length - 12)]?.time) || lastTime;
  for (const r of (params.rangePressure ?? []).slice(0, 10)) {
    if (!Number.isFinite(r.price) || r.price <= 0) continue;
    const pad = Math.max(r.price * 0.00035, 1);
    out.push({
      id: `eagle1-vp-${Math.round(r.price)}`,
      kind: 'box',
      label: '',
      x1: 0,
      y1: 0,
      x2: 1,
      y2: 1,
      time1: vpT0,
      time2: lastTime,
      price1: r.price + pad,
      price2: r.price - pad,
      priceFrozen1: r.price + pad,
      priceFrozen2: r.price - pad,
      confidence: Math.round(40 + r.intensity * 50),
      color:
        r.side === 'sell'
          ? `rgba(239,68,68,${0.12 + r.intensity * 0.28})`
          : r.side === 'buy'
            ? `rgba(34,197,94,${0.12 + r.intensity * 0.28})`
            : `rgba(250,204,21,${0.16 + r.intensity * 0.28})`,
      category: 'volume',
      noProject: true,
      zoneFillPreserve: true,
      overlayZoneExtraClass: 'eagle1-zone eagle1-zone--vp eagle1-hud-keep',
    });
  }
  return out;
}
