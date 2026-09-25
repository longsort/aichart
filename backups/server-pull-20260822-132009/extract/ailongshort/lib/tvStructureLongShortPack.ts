/**
 * TV 캡처형 구조 롱/숏 — EMA 리본(8/55) + EMA200 + structureMarksFu(BOS/CHOCH/MSB).
 * L/S 핀은 **고품질만**(안착·재시험·매크로) — 잦은 잡신호 억제. 참고·확정 매매 아님.
 */
import type { Candle, OverlayItem } from '@/types';
import { ema } from '@/lib/indicators';
import {
  structureMarksFu,
  resolveStructureMarkPhase,
  type StructureMarkPhase,
} from '@/lib/smcDeskOverlay';
import type { AtlasPulseMarker } from '@/lib/monthDeskAtlasPulseDesk';
import type { UTCTimestamp } from 'lightweight-charts';
import {
  buildTvStructureObsFromMarks,
  buildObForMark,
  candleTouchesActiveOb,
  nearestActiveObs,
  type TvStructureOb,
} from '@/lib/tvStructureObFromMarks';

const ID_PREFIX = 'merged-desk-tv-ls';
const CAT: OverlayItem['category'] = 'smcDesk';

export type TvStructureLsStance = 'LONG' | 'SHORT' | 'WAIT';

/** 돌파→안착→진입가능 게이트 (참고) */
export type TvStructureLsGate =
  | 'BREAKOUT'
  | 'SETTLING'
  | 'ENTER_READY'
  | 'WAIT'
  | 'FAILED';

export type TvStructureLsSignal = {
  index: number;
  time: number;
  price: number;
  side: 'LONG' | 'SHORT';
  tag: 'BOS' | 'CHOCH' | 'MSB';
  reasonKo: string;
};

export type TvStructureLsLive = {
  entry: number;
  stopLoss: number;
  tp1: number;
  invalidation: number;
  breakLevel: number;
  entryFrom: number;
  entryFromLabelKo: string;
  gate: TvStructureLsGate;
  gateKo: string;
  phase: StructureMarkPhase;
  side: 'LONG' | 'SHORT';
  tag: 'BOS' | 'CHOCH' | 'MSB';
  checklistKo: string[];
  /** 활성 상승/하락 OB */
  demandOb: { low: number; high: number; tag: string } | null;
  supplyOb: { low: number; high: number; tag: string } | null;
};

export type TvStructureLongShortPack = {
  overlays: OverlayItem[];
  markers: AtlasPulseMarker[];
  stance: TvStructureLsStance;
  summaryKo: string;
  signals: TvStructureLsSignal[];
  live: TvStructureLsLive | null;
  /** 차트 작도용 정밀 OB */
  obs: TvStructureOb[];
};

function lastFinite(arr: number[], i: number): number | null {
  const v = arr[i];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function atrAt(candles: Candle[], i: number, period = 14): number {
  const start = Math.max(1, i - period + 1);
  let sum = 0;
  let n = 0;
  for (let k = start; k <= i; k++) {
    const prev = candles[k - 1];
    const c = candles[k]!;
    const tr = prev
      ? Math.max(c.high - c.low, Math.abs(c.high - prev.close), Math.abs(c.low - prev.close))
      : c.high - c.low;
    sum += tr;
    n += 1;
  }
  return n > 0 ? sum / n : Math.max(candles[i]!.high - candles[i]!.low, 1e-8);
}

function fmt(p: number): string {
  if (!(p > 0) || !Number.isFinite(p)) return '—';
  if (p >= 1000) return p.toFixed(1);
  if (p >= 1) return p.toFixed(2);
  return p.toFixed(4);
}

function recentMarkBefore(
  marks: Array<{ index: number; price: number; tag: 'BOS' | 'CHOCH' | 'MSB'; bias: 'bullish' | 'bearish' }>,
  i: number,
  maxAgeBars: number
) {
  let best: (typeof marks)[number] | null = null;
  for (let k = marks.length - 1; k >= 0; k--) {
    const m = marks[k]!;
    if (m.index > i) continue;
    if (i - m.index > maxAgeBars) break;
    best = m;
    break;
  }
  return best;
}

function phaseToGateBase(phase: StructureMarkPhase): TvStructureLsGate {
  if (phase === 'failed') return 'FAILED';
  if (phase === 'breakout') return 'BREAKOUT';
  if (phase === 'settling') return 'SETTLING';
  if (phase === 'confirmed') return 'SETTLING';
  return 'WAIT';
}

function gateKoOf(g: TvStructureLsGate): string {
  switch (g) {
    case 'BREAKOUT':
      return '돌파·감시';
    case 'SETTLING':
      return '안착중';
    case 'ENTER_READY':
      return '진입가능';
    case 'FAILED':
      return '무효·관망';
    default:
      return '대기';
  }
}

/**
 * 정밀 OB 튜닝 (캡처형):
 * 1) CHOCH/MSB 돌파 직전 반대색 봉 = 상승/하락 OB
 * 2) ★L/★S = 안착 후 **해당 OB 재터치** + EMA200·리본 정렬
 * 3) MA만 스치는 신호 제외 — OB가 본체
 */
export function buildTvStructureLongShortPack(params: {
  candles: Candle[];
  swingPivot?: number;
  maxSignals?: number;
  maxMarks?: number;
}): TvStructureLongShortPack {
  const candles = params.candles;
  const n = candles.length;
  const empty: TvStructureLongShortPack = {
    overlays: [],
    markers: [],
    stance: 'WAIT',
    summaryKo: 'TV구조 롱숏: 캔들 부족 — 관망(참고).',
    signals: [],
    live: null,
    obs: [],
  };
  if (n < 50) return empty;

  const L = Math.max(2, Math.min(4, Math.round(params.swingPivot ?? 2)));
  const maxSignals = Math.max(4, Math.min(10, params.maxSignals ?? 6));
  const maxMarks = Math.max(24, Math.min(120, params.maxMarks ?? 80));
  const minGapBars = 12;
  const closes = candles.map((c) => c.close);
  const e8 = ema(closes, 8);
  const e21 = ema(closes, 21);
  const e55 = ema(closes, 55);
  const e200 = ema(closes, 200);
  const marks = structureMarksFu(candles, L, maxMarks);
  /** 표시용 OB는 BOS 포함(항상 박스 보이게), ★핀은 CHOCH/MSB만 */
  const obs = buildTvStructureObsFromMarks(candles, marks, { maxObs: 8, includeBos: true });

  const signals: TvStructureLsSignal[] = [];
  let lastSigIdx = -999;
  let lastSigSide: 'LONG' | 'SHORT' | null = null;

  for (let i = 80; i < n - 1; i++) {
    const c = candles[i]!;
    const ma8 = lastFinite(e8, i);
    const ma55 = lastFinite(e55, i);
    const ma200 = lastFinite(e200, i);
    if (ma8 == null || ma55 == null || ma200 == null) continue;

    const ribbonBull = ma8 >= ma55;
    const macroBull = c.close > ma200;
    const macroBear = c.close < ma200;
    const mk = recentMarkBefore(marks, i, 18);
    if (!mk || mk.tag === 'BOS') continue;
    const barsSince = i - mk.index;
    if (barsSince < 2 || barsSince > 18) continue;

    const phase = resolveStructureMarkPhase(mk, candles, i + 1);
    if (phase !== 'settling' && phase !== 'confirmed') continue;

    const ob = buildObForMark(candles, mk);
    if (!ob || ob.broken) continue;

    /** 신호 봉 시점까지 종가 무효면 제외 */
    if (mk.bias === 'bullish') {
      let brokenAt = false;
      for (let j = ob.index + 1; j <= i; j++) {
        if (candles[j]!.close < ob.low) {
          brokenAt = true;
          break;
        }
      }
      if (brokenAt) continue;
    } else {
      let brokenAt = false;
      for (let j = ob.index + 1; j <= i; j++) {
        if (candles[j]!.close > ob.high) {
          brokenAt = true;
          break;
        }
      }
      if (brokenAt) continue;
    }

    const range = Math.max(c.high - c.low, 1e-9);
    const bodyOk = Math.abs(c.close - c.open) / range >= 0.4;

    const longTouch = candleTouchesActiveOb(c, { ...ob, broken: false }, 'LONG') && c.close > c.open;
    const shortTouch = candleTouchesActiveOb(c, { ...ob, broken: false }, 'SHORT') && c.close < c.open;

    const longOk =
      macroBull && ribbonBull && mk.bias === 'bullish' && ob.bias === 'bullish' && bodyOk && longTouch;
    const shortOk =
      macroBear && !ribbonBull && mk.bias === 'bearish' && ob.bias === 'bearish' && bodyOk && shortTouch;

    if (!longOk && !shortOk) continue;
    if (longOk && shortOk) continue;
    if (i - lastSigIdx < minGapBars) continue;

    const side: 'LONG' | 'SHORT' = longOk ? 'LONG' : 'SHORT';
    if (lastSigSide === side && i - lastSigIdx < minGapBars * 2) continue;

    const next = candles[i + 1];
    if (next) {
      if (side === 'LONG' && next.close < ob.low) continue;
      if (side === 'SHORT' && next.close > ob.high) continue;
    }

    lastSigIdx = i;
    lastSigSide = side;
    signals.push({
      index: i,
      time: c.time as number,
      price: c.close,
      side,
      tag: mk.tag,
      reasonKo:
        side === 'LONG'
          ? `${mk.tag}안착·상승OB재터치 ${fmt(ob.low)}~${fmt(ob.high)}·EMA200↑(참고)`
          : `${mk.tag}안착·하락OB재터치 ${fmt(ob.low)}~${fmt(ob.high)}·EMA200↓(참고)`,
    });
  }

  const trimmed = signals.slice(-maxSignals);
  const last = candles[n - 1]!;
  const iLast = n - 1;
  const ma8L = lastFinite(e8, iLast);
  const ma21L = lastFinite(e21, iLast);
  const ma55L = lastFinite(e55, iLast);
  const ma200L = lastFinite(e200, iLast);
  const mkLive = recentMarkBefore(marks, iLast, 40);
  const atrL = atrAt(candles, iLast, 14);
  const { demand, supply } = nearestActiveObs(obs, last.close);

  let stance: TvStructureLsStance = 'WAIT';
  let live: TvStructureLsLive | null = null;

  if (ma8L != null && ma21L != null && ma55L != null && ma200L != null && mkLive) {
    const phase = resolveStructureMarkPhase(mkLive, candles, n);
    const ribbonBull = ma8L >= ma55L;
    const macroBull = last.close > ma200L;
    const macroBear = last.close < ma200L;
    const barsSince = iLast - mkLive.index;
    const obLive = buildObForMark(candles, mkLive);
    const structureOk = mkLive.tag === 'CHOCH' || mkLive.tag === 'MSB';
    const range = Math.max(last.high - last.low, 1e-9);
    const bodyOk = Math.abs(last.close - last.open) / range >= 0.36;

    const sideOkLong =
      structureOk &&
      mkLive.bias === 'bullish' &&
      macroBull &&
      ribbonBull &&
      last.close > ma200L;
    const sideOkShort =
      structureOk &&
      mkLive.bias === 'bearish' &&
      macroBear &&
      !ribbonBull &&
      last.close < ma200L;

    if (sideOkLong || sideOkShort) {
      const side: 'LONG' | 'SHORT' = sideOkLong ? 'LONG' : 'SHORT';
      stance = side;
      let gate = phaseToGateBase(phase);
      const settleOk = phase === 'settling' || phase === 'confirmed';
      const obTouch =
        obLive != null &&
        !obLive.broken &&
        candleTouchesActiveOb(last, obLive, side) &&
        bodyOk &&
        barsSince >= 2 &&
        barsSince <= 18;
      const nearDemand =
        side === 'LONG' &&
        demand != null &&
        !demand.broken &&
        last.low <= demand.high &&
        last.close >= demand.low;
      const nearSupply =
        side === 'SHORT' &&
        supply != null &&
        !supply.broken &&
        last.high >= supply.low &&
        last.close <= supply.high;

      if (gate === 'SETTLING' && settleOk && (obTouch || nearDemand || nearSupply)) {
        gate = 'ENTER_READY';
      }

      const breakLevel = mkLive.price;
      const activeOb =
        obLive && !obLive.broken ? obLive : side === 'LONG' ? demand : supply;
      let entryFrom: number;
      let entryFromLabelKo: string;
      if (side === 'LONG') {
        if (gate === 'ENTER_READY' && activeOb) {
          entryFrom = activeOb.mid;
          entryFromLabelKo = `상승OB ${fmt(activeOb.low)}~${fmt(activeOb.high)} · 여기부터(참고)`;
        } else if (gate === 'BREAKOUT') {
          entryFrom = breakLevel;
          entryFromLabelKo = `${mkLive.tag} 돌파 ${fmt(breakLevel)} — OB 재터치 전 관망`;
        } else {
          entryFrom = activeOb ? activeOb.mid : Math.max(breakLevel, ma21L);
          entryFromLabelKo = activeOb
            ? `안착 대기 · 상승OB ${fmt(activeOb.low)}~${fmt(activeOb.high)}`
            : `안착 대기 · ${mkLive.tag} ${fmt(breakLevel)}`;
        }
      } else {
        if (gate === 'ENTER_READY' && activeOb) {
          entryFrom = activeOb.mid;
          entryFromLabelKo = `하락OB ${fmt(activeOb.low)}~${fmt(activeOb.high)} · 여기부터(참고)`;
        } else if (gate === 'BREAKOUT') {
          entryFrom = breakLevel;
          entryFromLabelKo = `${mkLive.tag} 돌파 ${fmt(breakLevel)} — OB 재터치 전 관망`;
        } else {
          entryFrom = activeOb ? activeOb.mid : Math.min(breakLevel, ma21L);
          entryFromLabelKo = activeOb
            ? `안착 대기 · 하락OB ${fmt(activeOb.low)}~${fmt(activeOb.high)}`
            : `안착 대기 · ${mkLive.tag} ${fmt(breakLevel)}`;
        }
      }

      const entry = entryFrom;
      const stopLoss =
        side === 'LONG'
          ? (activeOb ? activeOb.low : Math.min(last.low, breakLevel)) - atrL * 0.55
          : (activeOb ? activeOb.high : Math.max(last.high, breakLevel)) + atrL * 0.55;
      const risk = Math.max(Math.abs(entry - stopLoss), atrL * 0.55);
      const tp1 = side === 'LONG' ? entry + risk * 2.0 : entry - risk * 2.0;

      live = {
        entry,
        stopLoss,
        tp1,
        invalidation: stopLoss,
        breakLevel,
        entryFrom,
        entryFromLabelKo,
        gate,
        gateKo: gateKoOf(gate),
        phase,
        side,
        tag: mkLive.tag,
        checklistKo: [
          `${mkLive.tag} · ${phase === 'breakout' ? '돌파' : phase === 'settling' ? '안착중' : phase === 'confirmed' ? '구조안착' : phase}`,
          gate === 'ENTER_READY'
            ? `OB 재터치 — ${entryFromLabelKo}`
            : gate === 'BREAKOUT'
              ? '돌파 직후 — 상승/하락 OB 재터치 전 관망'
              : '안착 중 — 정밀 OB 대기',
          `EMA200 ${macroBull ? '위' : '아래'} · 리본 ${ribbonBull ? '상승' : '하락'}`,
          `무효(참고): ${fmt(stopLoss)} · 확정·승률 아님`,
        ],
        demandOb: demand
          ? { low: demand.low, high: demand.high, tag: demand.markTag }
          : null,
        supplyOb: supply
          ? { low: supply.low, high: supply.high, tag: supply.markTag }
          : null,
      };
    } else if (trimmed.length) {
      const lastSig = trimmed[trimmed.length - 1]!;
      if (iLast - lastSig.index <= 8) stance = lastSig.side;
    }
  }

  /**
   * 트레이너 작도 — 짧은 라벨·짧은 선·최근 OB 1쌍만.
   * 무효·장문·중복 레일/존 제거. 확정 매매 아님.
   */
  const overlays: OverlayItem[] = [];
  const markers: AtlasPulseMarker[] = [];

  const shortMarkLabel = (
    tag: 'BOS' | 'CHOCH' | 'MSB',
    bias: 'bullish' | 'bearish',
    phase: StructureMarkPhase
  ): string | null => {
    if (phase === 'failed' || phase === 'trace') return null;
    const sign = bias === 'bullish' ? '+' : '-';
    if (tag === 'CHOCH') return `CHoCH${sign}`;
    if (tag === 'MSB') return `MSB${sign}`;
    return `BOS${sign}`;
  };

  /** L/S — 캔들 마커만 (HTML 네모 라벨 제거) */
  for (const s of trimmed) {
    const isLong = s.side === 'LONG';
    markers.push({
      time: s.time as UTCTimestamp,
      position: isLong ? 'belowBar' : 'aboveBar',
      shape: 'circle',
      color: isLong ? '#22C55E' : '#EF4444',
      text: isLong ? 'L' : 'S',
      size: 1,
      id: `${ID_PREFIX}-mk-${s.side.toLowerCase()}-${s.time}`,
    });
  }

  /** 구조선: 유효 단계만 · 돌파봉→+12봉 짧은 선 · 라벨은 돌파봉 윅에 부착 */
  const recentMarks = marks
    .filter((m) => m.tag === 'CHOCH' || m.tag === 'MSB')
    .slice(-2);
  for (const mk of recentMarks) {
    const c = candles[mk.index];
    if (!c) continue;
    const phase = resolveStructureMarkPhase(mk, candles, n);
    const lbl = shortMarkLabel(mk.tag, mk.bias, phase);
    if (!lbl) continue;
    const bull = mk.bias === 'bullish';
    const i2 = Math.min(n - 1, mk.index + 12);
    const t1 = c.time as number;
    const t2 = candles[i2]!.time as number;
    const pinPrice = bull ? c.high : c.low;
    /** 짧은 수평선(라벨 없음) + 돌파봉 윅에만 라벨 */
    overlays.push({
      id: `${ID_PREFIX}-lvl-${mk.tag}-${mk.index}`,
      kind: 'keyLevel',
      label: '',
      x1: 0,
      y1: 0,
      time1: t1,
      time2: t2,
      price1: mk.price,
      price2: mk.price,
      confidence: 70,
      color: bull ? 'rgba(34,197,94,0.75)' : 'rgba(239,68,68,0.75)',
      lineLabelColor: bull ? '#86EFAC' : '#FCA5A5',
      lineDash: '5 4',
      lineStrokeWidth: phase === 'confirmed' ? 2 : 1,
      category: CAT,
      structureBias: mk.bias,
      noProject: true,
      labelTooltip: `${lbl} @ ${fmt(mk.price)} (참고)`,
    });
    overlays.push({
      id: `${ID_PREFIX}-pin-${mk.tag}-${mk.index}`,
      kind: 'label',
      label: lbl,
      x1: 0,
      y1: 0,
      time1: t1,
      price1: pinPrice,
      confidence: 72,
      color: bull ? '#22C55E' : '#EF4444',
      lineLabelColor: '#F8FAFC',
      labelBackgroundColor: bull ? 'rgba(21,128,61,0.88)' : 'rgba(153,27,27,0.88)',
      labelTextColor: '#F8FAFC',
      category: CAT,
      structureBias: mk.bias,
      labelTooltip: `${lbl} · 종가 돌파 기준(참고)`,
    });
  }

  /** OB: 현재가 기준 상승 1 + 하락 1만 (트레이너 존) */
  const activeObs: TvStructureOb[] = [];
  if (demand && !demand.broken) activeObs.push(demand);
  if (supply && !supply.broken) activeObs.push(supply);
  if (!activeObs.length) {
    for (const o of obs) {
      if (!o.broken) activeObs.push(o);
      if (activeObs.length >= 2) break;
    }
  }
  for (const ob of activeObs.slice(0, 2)) {
    const c0 = candles[ob.index];
    if (!c0) continue;
    const bull = ob.bias === 'bullish';
    overlays.push({
      id: `${ID_PREFIX}-ob-${ob.bias}-${ob.index}`,
      kind: bull ? 'demandZone' : 'supplyZone',
      label: bull ? 'Bu' : 'Be',
      x1: 0,
      y1: 0,
      time1: c0.time as number,
      time2: last.time as number,
      price1: ob.high,
      price2: ob.low,
      confidence: 68,
      color: bull ? 'rgba(34,197,94,0.20)' : 'rgba(239,68,68,0.20)',
      category: CAT,
      structureBias: ob.bias,
      zoneFillPreserve: true,
      zoneSpanOnly: true,
      overlayZoneExtraClass: 'merged-desk-tv-ls-zone',
      zoneFaceBase: bull ? 'Bu' : 'Be',
      zoneFaceLang: 'en',
      labelTooltip: `${bull ? '상승' : '하락'}OB ${fmt(ob.low)}~${fmt(ob.high)} · ${ob.markTag}(참고)`,
    });
  }

  /** 라이브: 진입가능일 때만 E/SL 짧은 선 + 마지막 봉 GO 마커 */
  if (live && live.gate === 'ENTER_READY') {
    const isLong = live.side === 'LONG';
    const t1 = candles[Math.max(0, n - 10)]!.time as number;
    const t2 = last.time as number;
    overlays.push({
      id: `${ID_PREFIX}-rail-e`,
      kind: 'keyLevel',
      label: 'E',
      x1: 0,
      y1: 0,
      time1: t1,
      time2: t2,
      price1: live.entry,
      price2: live.entry,
      confidence: 74,
      color: isLong ? '#4ADE80' : '#FB7185',
      lineLabelColor: isLong ? '#4ADE80' : '#FB7185',
      lineStrokeWidth: 2,
      category: CAT,
      noProject: true,
      labelTooltip: `E ${fmt(live.entry)} · ${live.entryFromLabelKo}`,
    });
    overlays.push({
      id: `${ID_PREFIX}-rail-sl`,
      kind: 'keyLevel',
      label: 'SL',
      x1: 0,
      y1: 0,
      time1: t1,
      time2: t2,
      price1: live.stopLoss,
      price2: live.stopLoss,
      confidence: 70,
      color: '#FBBF24',
      lineLabelColor: '#FBBF24',
      lineDash: '4 3',
      lineStrokeWidth: 1,
      category: CAT,
      noProject: true,
      labelTooltip: `SL ${fmt(live.stopLoss)} (참고)`,
    });
    markers.push({
      time: last.time as UTCTimestamp,
      position: isLong ? 'belowBar' : 'aboveBar',
      shape: 'square',
      color: isLong ? '#22C55E' : '#EF4444',
      text: isLong ? 'GO↑' : 'GO↓',
      size: 2,
      id: `${ID_PREFIX}-mk-go`,
    });
  } else if (live) {
    markers.push({
      time: last.time as UTCTimestamp,
      position: 'aboveBar',
      shape: 'circle',
      color: '#94A3B8',
      text: live.gate === 'BREAKOUT' ? 'BRK' : live.gate === 'SETTLING' ? 'SET' : '…',
      size: 1,
      id: `${ID_PREFIX}-mk-gate`,
    });
  }

  const bullN = trimmed.filter((s) => s.side === 'LONG').length;
  const bearN = trimmed.filter((s) => s.side === 'SHORT').length;
  const obN = obs.filter((o) => !o.broken).length;
  const summaryKo = live
    ? `트레이너작도(참고): ${live.gateKo} · ${live.side === 'LONG' ? '롱' : '숏'} · OB${Math.min(obN, 2)} · L/S ${trimmed.length}`
    : `트레이너작도(참고): ${
        stance === 'LONG' ? '롱' : stance === 'SHORT' ? '숏' : '관망'
      } · OB ${Math.min(obN, 2)} · L${bullN}/S${bearN}`;

  return { overlays, markers, stance, summaryKo, signals: trimmed, live, obs };
}

export function isTvStructureLsOverlayId(id: string | undefined | null): boolean {
  return String(id || '').startsWith(ID_PREFIX);
}

/**
 * TV롱숏 ON — Mirage/SMC 장문·무효 라벨만 숨김.
 * 존·선 기하는 유지(기능 삭제 아님). 트레이너 작도 가독성용.
 */
export function muteClutterForTvTrainerDraw(overlays: OverlayItem[]): OverlayItem[] {
  const out: OverlayItem[] = [];
  for (const o of overlays) {
    const id = String(o.id || '');
    if (id.startsWith(ID_PREFIX)) {
      out.push(o);
      continue;
    }
    const label = String(o.label || '');
    const face = `${o.zoneFaceBase || ''}${o.zoneFaceSignal || ''}${o.zoneFaceDetailKo || ''}`;
    const text = `${label} ${face}`;
    if (
      o.kind === 'label' &&
      (/무효|CHoCH·무효|CHOCH.*무효|LONG CONF|%-SELL|%-BUY|%-VERDICT/i.test(text) ||
        /▲\s*LONG|▼\s*SHORT|OB SELL|OB BUY|Support\s*\d|Resistance\s*\d/i.test(text))
    ) {
      continue;
    }
    if (
      (o.kind === 'keyLevel' || o.kind === 'bos' || o.kind === 'choch') &&
      /무효/.test(label)
    ) {
      continue;
    }
    if (o.kind === 'demandZone' || o.kind === 'supplyZone' || o.kind === 'zone') {
      out.push({
        ...o,
        label: '',
        zoneFaceBase: undefined,
        zoneFaceSignal: undefined,
        zoneFaceDetailKo: undefined,
      });
      continue;
    }
    out.push(o);
  }
  return out;
}
