/**
 * 파랑·빨강띠 LOCK 레일 × 합류 게이트.
 * 거래량 · 피보GP · AVWAP · VRVP/고정VP · SFP (+ $$$$ · EQH/EQL · Hot).
 * 겹친 개수≠승률. 2+ 이면 「자리 참고」 · 아니면 WAIT.
 */
import type { AnalyzeResponse, Candle, OverlayItem } from '@/types';
import type { MergedDeskChannelGeom } from '@/lib/mergedDeskBlueRedChannels';
import type { MergedDeskRbVolumeSyncPack } from '@/lib/mergedDeskRbVolumeSync';
import type { MergedDeskHotZoneEntry } from '@/lib/mergedDeskHotZoneEntry';
import type { MonthDeskMoneyZoneHud } from '@/lib/monthDeskMoneyZone';
import type { MergedDeskAnchoredVwapPack } from '@/lib/mergedDeskAnchoredVwap';
import type { AvwapFibLeg } from '@/lib/vwap/avwapFibConfluence';
import type { AtlasPulsePriceLine } from '@/lib/monthDeskAtlasPulseDesk';
import type { AtlasPulseMarker } from '@/lib/monthDeskAtlasPulseDesk';
import type { RbWavePhase } from '@/lib/mergedDeskRbWaveLock';

export type RbGateHitId =
  | 'volume'
  | 'fibGp'
  | 'avwap'
  | 'vrvp'
  | 'fixedVp'
  | 'sfp'
  | 'money'
  | 'eq'
  | 'hot';

export type RbGateHit = {
  id: RbGateHitId;
  ok: boolean;
  labelKo: string;
  price?: number;
  weight: number;
};

export type MergedDeskRbEdgeConfluenceGatePack = {
  hits: RbGateHit[];
  hitCount: number;
  coreHitCount: number;
  placeRefOk: boolean;
  side: 'LONG' | 'SHORT' | 'WAIT';
  summaryKo: string;
  shortKo: string;
  priceLines: AtlasPulsePriceLine[];
  markers: AtlasPulseMarker[];
  fixedVpPoc: number | null;
  sfp: { side: 'bull' | 'bear'; price: number; time: number } | null;
};

function atrApprox(candles: Candle[]): number {
  const n = candles.length;
  if (n < 5) return Math.abs(Number(candles[n - 1]?.close) || 1) * 0.008;
  let s = 0;
  let c = 0;
  for (let i = Math.max(1, n - 14); i < n; i++) {
    const a = candles[i]!;
    const b = candles[i - 1]!;
    s += Math.max(a.high - a.low, Math.abs(a.high - b.close), Math.abs(a.low - b.close));
    c += 1;
  }
  return c > 0 ? s / c : Math.abs(Number(candles[n - 1]?.close) || 1) * 0.008;
}

function near(a: number, b: number, tol: number): boolean {
  return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= tol;
}

function overlaps(aHi: number, aLo: number, bHi: number, bLo: number): boolean {
  return Math.max(aHi, aLo) >= Math.min(bHi, bLo) && Math.min(aHi, aLo) <= Math.max(bHi, bLo);
}

function lastVwap(line: Array<{ time: number; value: number }> | undefined): number | null {
  if (!line?.length) return null;
  const v = Number(line[line.length - 1]!.value);
  return Number.isFinite(v) && v > 0 ? v : null;
}

/** 채널 구간 고정 거래량 프로파일 POC */
export function computeRbFixedVolumePoc(
  candles: Candle[],
  geom: MergedDeskChannelGeom,
  bins = 24
): number | null {
  const t0 = Number(geom.tStart);
  const t1 = Number(geom.tEnd);
  const rows = candles.filter((c) => {
    const t = Number(c.time);
    return t >= t0 && t <= t1;
  });
  if (rows.length < 6) return null;
  let lo = Infinity;
  let hi = -Infinity;
  for (const c of rows) {
    lo = Math.min(lo, Number(c.low));
    hi = Math.max(hi, Number(c.high));
  }
  if (!(hi > lo)) return null;
  const step = (hi - lo) / bins;
  const vol = new Array(bins).fill(0) as number[];
  for (const c of rows) {
    const mid = (Number(c.high) + Number(c.low) + Number(c.close)) / 3;
    const v = Number(c.volume) || 0;
    if (!(v > 0) || !Number.isFinite(mid)) continue;
    let i = Math.floor((mid - lo) / step);
    if (i < 0) i = 0;
    if (i >= bins) i = bins - 1;
    vol[i]! += v;
  }
  let bestI = 0;
  let bestV = -1;
  for (let i = 0; i < bins; i++) {
    if (vol[i]! > bestV) {
      bestV = vol[i]!;
      bestI = i;
    }
  }
  return lo + (bestI + 0.5) * step;
}

/** 레일 SFP — 심지 이탈 + 종가 회수 */
export function detectRbRailSfp(
  candles: Candle[],
  geom: MergedDeskChannelGeom,
  atr: number
): { side: 'bull' | 'bear'; price: number; time: number } | null {
  const n = candles.length;
  if (n < 3) return null;
  const look = Math.min(6, n);
  const eps = atr * 0.08;
  for (let k = 1; k <= look; k++) {
    const c = candles[n - k]!;
    const t = Number(c.time);
    /** 팁 레일 기준(최근 투영) */
    if (c.low < geom.tipLower - eps && c.close > geom.tipLower) {
      return { side: 'bull', price: geom.tipLower, time: t };
    }
    if (c.high > geom.tipUpper + eps && c.close < geom.tipUpper) {
      return { side: 'bear', price: geom.tipUpper, time: t };
    }
  }
  return null;
}

function pushHit(hits: RbGateHit[], id: RbGateHitId, ok: boolean, labelKo: string, weight: number, price?: number) {
  hits.push({ id, ok, labelKo, weight, price });
}

export function computeMergedDeskRbEdgeConfluenceGate(params: {
  candles: Candle[];
  geom: MergedDeskChannelGeom | null;
  volSync?: MergedDeskRbVolumeSyncPack | null;
  avwapHigh?: MergedDeskAnchoredVwapPack | null;
  avwapLow?: MergedDeskAnchoredVwapPack | null;
  fibLegs?: AvwapFibLeg[] | null;
  vrvpPoc?: number | null;
  vrvpVaLow?: number | null;
  vrvpVaHigh?: number | null;
  hotZones?: MergedDeskHotZoneEntry[] | null;
  moneyHud?: MonthDeskMoneyZoneHud | null;
  analysis?: AnalyzeResponse | null;
  wavePhase?: RbWavePhase | null;
  masterSide?: 'LONG' | 'SHORT' | 'WAIT' | null;
}): MergedDeskRbEdgeConfluenceGatePack {
  const hits: RbGateHit[] = [];
  const candles = params.candles;
  const geom = params.geom;
  const atr = atrApprox(candles);
  const tol = atr * 0.55;
  const close = Number(candles[candles.length - 1]?.close) || 0;

  let side: 'LONG' | 'SHORT' | 'WAIT' = params.masterSide ?? 'WAIT';
  if (side === 'WAIT' && geom) {
    if (Math.abs(geom.slopePct) < 0.0032) side = 'WAIT';
    else side = geom.descending ? 'SHORT' : 'LONG';
  }

  if (!geom) {
    return {
      hits: [],
      hitCount: 0,
      coreHitCount: 0,
      placeRefOk: false,
      side: 'WAIT',
      summaryKo: '합류게이트 — 채널 없음',
      shortKo: '합류대기',
      priceLines: [],
      markers: [],
      fixedVpPoc: null,
      sfp: null,
    };
  }

  /** 1) 거래량 */
  const vs = params.volSync;
  if (vs) {
    const volSide = vs.side === 'up' ? 'LONG' : vs.side === 'down' ? 'SHORT' : null;
    const ok =
      side !== 'WAIT' &&
      ((volSide === side && vs.confirm === 'confirm') ||
        (vs.rvol != null && vs.rvol >= 1.2 && vs.confirm !== 'diverge'));
    pushHit(
      hits,
      'volume',
      ok,
      ok
        ? `거래량확인 · RVOL${vs.rvol != null ? vs.rvol.toFixed(1) : '—'} · 매수${(vs.buyPct * 100).toFixed(0)}%`
        : `거래량약/괴리 · ${vs.confirm}`,
      ok ? 14 : 0
    );
  } else {
    pushHit(hits, 'volume', false, '거래량 미연동', 0);
  }

  /** 2) 피보 골든포켓 */
  const legs = params.fibLegs ?? [];
  let gpOk = false;
  let gpMid: number | undefined;
  for (const leg of legs) {
    const top = Math.max(leg.goldenTop, leg.goldenBot);
    const bot = Math.min(leg.goldenTop, leg.goldenBot);
    if (overlaps(geom.tipUpper, geom.tipLower, top, bot) || near((top + bot) / 2, close, tol * 1.2)) {
      gpOk = true;
      gpMid = (top + bot) / 2;
      break;
    }
  }
  pushHit(
    hits,
    'fibGp',
    gpOk,
    gpOk ? `피보GP 채널겹침 · ${gpMid?.toFixed(0)}` : '피보GP 미겹침',
    gpOk ? 16 : 0,
    gpMid
  );

  /** 3) AVWAP 고점범위 */
  const hiE = lastVwap(params.avwapHigh?.extremeLine);
  const hiO = lastVwap(params.avwapHigh?.openLine);
  const loE = lastVwap(params.avwapLow?.extremeLine);
  const avwapLevels = [hiE, hiO, loE].filter((x): x is number => x != null && x > 0);
  const avwapHit = avwapLevels.find(
    (p) =>
      near(p, geom.tipUpper, tol) ||
      near(p, geom.tipLower, tol) ||
      near(p, geom.tipMid, tol) ||
      (p >= geom.tipLower && p <= geom.tipUpper)
  );
  pushHit(
    hits,
    'avwap',
    avwapHit != null,
    avwapHit != null ? `AVWAP고점범위 · ${avwapHit.toFixed(0)}` : 'AVWAP 레일 밖',
    avwapHit != null ? 14 : 0,
    avwapHit ?? undefined
  );

  /** 4) VRVP POC/VA */
  const poc = params.vrvpPoc ?? null;
  const vaLo = params.vrvpVaLow ?? null;
  const vaHi = params.vrvpVaHigh ?? null;
  const vrvpOk =
    (poc != null &&
      (near(poc, geom.tipLower, tol) ||
        near(poc, geom.tipUpper, tol) ||
        (poc >= geom.tipLower && poc <= geom.tipUpper))) ||
    (vaLo != null && vaHi != null && overlaps(geom.tipUpper, geom.tipLower, vaHi, vaLo));
  pushHit(
    hits,
    'vrvp',
    vrvpOk,
    vrvpOk
      ? `VRVP·POC ${poc != null ? poc.toFixed(0) : 'VA'} 채널합류`
      : 'VRVP 채널 미합류',
    vrvpOk ? 14 : 0,
    poc ?? undefined
  );

  /** 5) 고정 거래량 프로파일 (파동 구간) */
  const fixedVpPoc = computeRbFixedVolumePoc(candles, geom);
  const fixedOk =
    fixedVpPoc != null &&
    (near(fixedVpPoc, geom.tipLower, tol) ||
      near(fixedVpPoc, geom.tipUpper, tol) ||
      near(fixedVpPoc, close, tol) ||
      (fixedVpPoc >= geom.tipLower && fixedVpPoc <= geom.tipUpper));
  pushHit(
    hits,
    'fixedVp',
    fixedOk,
    fixedOk && fixedVpPoc != null
      ? `고정VP POC ${fixedVpPoc.toFixed(0)}`
      : '고정VP 약함',
    fixedOk ? 12 : 0,
    fixedVpPoc ?? undefined
  );

  /** 6) SFP */
  const sfp = detectRbRailSfp(candles, geom, atr);
  const sfpOk =
    sfp != null &&
    ((side === 'LONG' && sfp.side === 'bull') ||
      (side === 'SHORT' && sfp.side === 'bear') ||
      side === 'WAIT');
  pushHit(
    hits,
    'sfp',
    sfpOk,
    sfp
      ? `SFP ${sfp.side === 'bull' ? '하단스윕회수' : '상단스윕회수'}`
      : 'SFP 없음',
    sfpOk ? 14 : 0,
    sfp?.price
  );

  /** 2순위: $$$$ */
  const money = params.moneyHud;
  let moneyOk = false;
  let moneyPx: number | undefined;
  if (money) {
    const pools = [
      ...(money.pools ?? []),
      ...(money.long ? [money.long] : []),
      ...(money.short ? [money.short] : []),
    ];
    for (const z of pools) {
      const top = Number(z.priceTop);
      const bot = Number(z.priceBot);
      if (overlaps(geom.tipUpper, geom.tipLower, top, bot)) {
        moneyOk = true;
        moneyPx = (top + bot) / 2;
        break;
      }
    }
  }
  pushHit(hits, 'money', moneyOk, moneyOk ? '$$$$ 머니존 겹침' : '$$$$ 미겹침', moneyOk ? 8 : 0, moneyPx);

  /** EQH/EQL — analysis overlays / levels */
  let eqOk = false;
  let eqPx: number | undefined;
  const eqLevels: number[] = [];
  const an = params.analysis as AnalyzeResponse & {
    eqh?: Array<{ price?: number }>;
    eql?: Array<{ price?: number }>;
    levels?: { eqh?: number[]; eql?: number[] };
  } | null;
  if (an?.levels?.eqh) eqLevels.push(...an.levels.eqh.filter((x) => x > 0));
  if (an?.levels?.eql) eqLevels.push(...an.levels.eql.filter((x) => x > 0));
  if (Array.isArray(an?.eqh)) {
    for (const e of an!.eqh!) {
      const p = Number(e?.price);
      if (p > 0) eqLevels.push(p);
    }
  }
  if (Array.isArray(an?.eql)) {
    for (const e of an!.eql!) {
      const p = Number(e?.price);
      if (p > 0) eqLevels.push(p);
    }
  }
  for (const p of eqLevels) {
    if (near(p, geom.tipUpper, tol) || near(p, geom.tipLower, tol)) {
      eqOk = true;
      eqPx = p;
      break;
    }
  }
  pushHit(hits, 'eq', eqOk, eqOk ? `EQH/EQL 레일근접 · ${eqPx?.toFixed(0)}` : 'EQ 미근접', eqOk ? 8 : 0, eqPx);

  /** Hot */
  const hots = params.hotZones ?? [];
  const hotHit = hots.find((z) => overlaps(geom.tipUpper, geom.tipLower, z.top, z.bot));
  const hotOk = !!hotHit && (side === 'WAIT' || hotHit.side === side);
  pushHit(
    hits,
    'hot',
    hotOk,
    hotOk && hotHit ? `Hot ${hotHit.labelKo}` : 'Hot 미합류',
    hotOk ? 8 : 0,
    hotHit ? (hotHit.top + hotHit.bot) / 2 : undefined
  );

  const coreIds: RbGateHitId[] = ['volume', 'fibGp', 'avwap', 'vrvp', 'fixedVp', 'sfp'];
  const coreHitCount = hits.filter((h) => h.ok && coreIds.includes(h.id)).length;
  const hitCount = hits.filter((h) => h.ok).length;
  /** 가격 자리: (GP|AVWAP|POC/고정VP) 중 1 + (거래량|SFP) 중 1 또는 핵심 2+ */
  const priceSeat = hits.some((h) => h.ok && (h.id === 'fibGp' || h.id === 'avwap' || h.id === 'vrvp' || h.id === 'fixedVp'));
  const authenticity = hits.some((h) => h.ok && (h.id === 'volume' || h.id === 'sfp'));
  const placeRefOk = (priceSeat && authenticity) || coreHitCount >= 2;

  const waveTag =
    params.wavePhase === 'LOCK'
      ? '고정유지'
      : params.wavePhase === 'FREEZE'
        ? '과거고정'
        : params.wavePhase === 'REBUILD'
          ? '재구축'
          : '';
  const dirKo = side === 'LONG' ? '롱' : side === 'SHORT' ? '숏' : '대기';
  const shortKo = placeRefOk ? `자리참고·${dirKo}${waveTag ? `·${waveTag}` : ''}` : `합류대기·${dirKo}`;
  const summaryKo = `${shortKo} · 핵심${coreHitCount}/6 · 전체${hitCount} · 승률아님`;

  const priceLines: AtlasPulsePriceLine[] = [];
  if (fixedVpPoc != null && fixedOk) {
    priceLines.push({
      price: fixedVpPoc,
      title: '고정VP·POC',
      color: 'rgba(45,212,191,0.9)',
      lineWidth: 1,
      lineStyle: 'dashed',
      axisLabel: true,
    });
  }
  if (gpMid != null && gpOk) {
    priceLines.push({
      price: gpMid,
      title: '피보GP',
      color: 'rgba(250,204,21,0.85)',
      lineWidth: 1,
      lineStyle: 'dashed',
      axisLabel: true,
    });
  }
  if (avwapHit != null) {
    priceLines.push({
      price: avwapHit,
      title: 'AVWAP합류',
      color: 'rgba(248,113,113,0.85)',
      lineWidth: 1,
      lineStyle: 'dashed',
      axisLabel: true,
    });
  }

  const markers: AtlasPulseMarker[] = [];
  if (sfp) {
    markers.push({
      time: sfp.time as AtlasPulseMarker['time'],
      position: sfp.side === 'bull' ? 'belowBar' : 'aboveBar',
      color: sfp.side === 'bull' ? '#4ade80' : '#f87171',
      shape: 'circle',
      text: sfp.side === 'bull' ? 'SFP↑' : 'SFP↓',
      size: 2,
      id: `rb-sfp-${sfp.side}-${sfp.time}`,
    });
  }

  return {
    hits,
    hitCount,
    coreHitCount,
    placeRefOk,
    side,
    summaryKo,
    shortKo,
    priceLines,
    markers,
    fixedVpPoc,
    sfp,
  };
}

export function stampRbOverlaysWithEdgeGate(
  overlays: OverlayItem[],
  gate: MergedDeskRbEdgeConfluenceGatePack | null
): OverlayItem[] {
  if (!gate || !overlays.length) return overlays;
  return overlays.map((o) => {
    const id = String(o.id || '');
    const cls = String(o.overlayZoneExtraClass || '');
    const isRb =
      id.startsWith('merged-desk-rb-') ||
      cls.includes('merged-desk-rb-channel') ||
      cls.includes('merged-desk-blue-red-channel');
    if (!isRb) return o;
    const isPri = cls.includes('merged-desk-rb-primary') && o.kind === 'channelBand';
    const tip = gate.hits
      .filter((h) => h.ok)
      .slice(0, 6)
      .map((h) => `✓ ${h.labelKo}`)
      .join('\n');
    const prev = String(o.labelTooltip || '').trim();
    return {
      ...o,
      label: isPri
        ? `${String(o.label || '').replace(/\s*자리참고[^\s]*/g, '').replace(/\s*합류대기[^\s]*/g, '')} ${gate.shortKo}`.trim()
        : o.label,
      labelTooltip: prev.includes(gate.shortKo) ? prev : prev ? `${prev}\n${gate.summaryKo}\n${tip}` : `${gate.summaryKo}\n${tip}`,
      overlayZoneExtraClass: `${cls} merged-desk-rb-edge-gate ${
        gate.placeRefOk ? 'merged-desk-rb-edge-gate--ok' : 'merged-desk-rb-edge-gate--wait'
      }`.trim(),
    };
  });
}
