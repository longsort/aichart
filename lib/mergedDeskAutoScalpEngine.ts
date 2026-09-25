/**
 * 자동매매 페이퍼 — 폭락존터치(Arm) → SFP → 로켓 → FIRE
 * 터치만으로 진입하지 않음 · 기존 분석 합류 유지.
 * FIRE 시 존 기준 SL 필수 · R&R 미달 스킵.
 * 청산: 사용자 선택 TP1컷 / TP2러너(+잠금) / TP3러너(+잠금) · 시간손절.
 * ROE 기본 5%/10%/12% (설정·레버 연동). 실주문 없음. 확정 수익·승률 아님.
 */
import type { Candle } from '@/types';
import type { MergedDeskChannelGeom } from '@/lib/mergedDeskBlueRedChannels';
import type { MtfDumpZoneSpec } from '@/lib/mergedDeskMtfDumpZoneBridge';
import { detectRbRailSfp } from '@/lib/mergedDeskRbEdgeConfluenceGate';
import { candleTouchesZone } from '@/lib/mergedDeskSignalOutcomeEngine';
import {
  resolveUltraScalpRoeCaps,
  ultraScalpCostGatePass,
} from '@/lib/doksuri1/ultraScalpEngine';
import type { ScalpExitMode } from '@/lib/mergedDeskAutoTradeConfig';

export type AutoScalpPhase =
  | 'IDLE'
  | 'ARMED'
  | 'SFP_OK'
  | 'READY'
  | 'OPEN'
  | 'TP1_HIT'
  | 'BE'
  | 'CLOSED';

export type AutoScalpCloseReason =
  | 'TP1_FULL'
  | 'TP2'
  | 'TP3'
  | 'SL'
  | 'BE_STOP'
  | 'LOCK_STOP'
  | 'TIME_STOP'
  | 'INVALID'
  | 'COST'
  | null;

export type AutoScalpPaperTrade = {
  id: string;
  symbol: string;
  timeframe: string;
  direction: 'LONG' | 'SHORT';
  phase: AutoScalpPhase;
  armedAt: number;
  armedZoneId: string;
  armedZoneMid: number;
  sfpAt: number | null;
  sfpPrice: number | null;
  rocketAt: number | null;
  entryBarTime: number | null;
  entry: number | null;
  sl: number | null;
  /** 활성 SL (TP1 후 잠금가 또는 본절) */
  activeSl: number | null;
  tp1: number | null;
  tp2: number | null;
  tp3: number | null;
  leverage: number;
  /** TP1 청산 비중 0~1 (컷=1) */
  tp1Frac: number;
  /** TP2에서 추가 청산 비중(원본 대비, TP3모드) */
  tp2Frac: number;
  realizedRoePct: number;
  remainingFrac: number;
  barsHeld: number;
  maxBars: number;
  closeReason: AutoScalpCloseReason;
  closedAt: number | null;
  noteKo: string;
  mfeRoePct: number;
  maeRoePct: number;
  exitMode?: ScalpExitMode;
  lockRoePct?: number;
  /** TP1 이후 수익잠금 적용됨 */
  profitLocked?: boolean;
  fourStrategyId?: string | null;
  fourSupporting?: string[] | null;
  fourEntryScore?: number | null;
  fourRegime?: string | null;
};

export type AutoScalpEngineSnapshot = {
  trade: AutoScalpPaperTrade | null;
  events: AutoScalpJournalEvent[];
  stripKo: string;
  detailKo: string;
};

export type AutoScalpJournalEvent = {
  kind:
    | 'AUTO_SCALP_ARM'
    | 'AUTO_SCALP_SFP'
    | 'AUTO_SCALP_ROCKET'
    | 'AUTO_SCALP_FIRE'
    | 'AUTO_SCALP_TP1'
    | 'AUTO_SCALP_BE'
    | 'AUTO_SCALP_TP2'
    | 'AUTO_SCALP_SL'
    | 'AUTO_SCALP_TIME'
    | 'AUTO_SCALP_CLOSE';
  at: number;
  direction: 'LONG' | 'SHORT' | 'NEUTRAL';
  price: number;
  noteKo: string;
  tradeId: string;
  meta?: Record<string, string | number | boolean | null>;
};

const DEFAULT_LEV = 10;
const TP1_ROE_CAP = 0.05;
const TP2_ROE_CAP = 0.1;
const TP1_FRAC = 0.55;
const DEFAULT_MAX_BARS = 12;
const FEE_RT = 0.0012; // 왕복 대략

function atr14(candles: Candle[]): number {
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

function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function dumpLongBias(z: MtfDumpZoneSpec): boolean {
  if (z.lifeState === 'CONFIRM_UP') return true;
  if (z.lifeState === 'CONFIRM_DOWN' || z.lifeState === 'CONFIRM_RESIST') return false;
  return z.bandRole !== 'ceiling';
}

function dumpShortBias(z: MtfDumpZoneSpec): boolean {
  if (z.lifeState === 'CONFIRM_DOWN' || z.lifeState === 'CONFIRM_RESIST') return true;
  if (z.lifeState === 'CONFIRM_UP') return false;
  return z.bandRole === 'ceiling';
}

function zoneId(z: MtfDumpZoneSpec): string {
  return `${z.sourceTf}:${z.bandRole || 'floor'}:${Math.round(z.mid)}`;
}

/** 가격 이동 → ROE (레버리지 단순 환산, 수수료 전) */
export function priceMoveToRoePct(entry: number, exit: number, direction: 'LONG' | 'SHORT', lev: number): number {
  if (!(entry > 0)) return 0;
  const raw = direction === 'LONG' ? (exit - entry) / entry : (entry - exit) / entry;
  return raw * lev;
}

/** ROE 목표 → 가격 */
export function roeTargetPrice(entry: number, direction: 'LONG' | 'SHORT', lev: number, roe: number): number {
  const move = roe / Math.max(1, lev);
  return direction === 'LONG' ? entry * (1 + move) : entry * (1 - move);
}

export function structureTp(
  entry: number,
  direction: 'LONG' | 'SHORT',
  zone: MtfDumpZoneSpec | null,
  geom: MergedDeskChannelGeom | null,
  atr: number,
  roeCap: number,
  lev: number
): number {
  const candidates: number[] = [];
  if (zone) {
    if (direction === 'LONG') {
      if (zone.bounceCapPrice != null && zone.bounceCapPrice > entry) candidates.push(zone.bounceCapPrice);
      if (zone.top > entry) candidates.push(zone.top);
      candidates.push(entry + atr * 1.2);
    } else {
      if (zone.bot < entry) candidates.push(zone.bot);
      candidates.push(entry - atr * 1.2);
    }
  }
  if (geom) {
    if (direction === 'LONG' && geom.tipUpper > entry) candidates.push(geom.tipUpper);
    if (direction === 'SHORT' && geom.tipLower < entry) candidates.push(geom.tipLower);
  }
  const capPx = roeTargetPrice(entry, direction, lev, roeCap);
  candidates.push(capPx);
  if (direction === 'LONG') {
    const above = candidates.filter((p) => p > entry).sort((a, b) => a - b);
    const pick = above[0] ?? capPx;
    return Math.min(pick, capPx);
  }
  const below = candidates.filter((p) => p < entry).sort((a, b) => b - a);
  const pick = below[0] ?? capPx;
  return Math.max(pick, capPx);
}

/**
 * 존 기준 손절. zone 없으면 null (requireZoneSl 시 FIRE 금지).
 * LONG: 존 bot 바깥 · SHORT: 존 top 바깥.
 */
export function structureSl(
  entry: number,
  direction: 'LONG' | 'SHORT',
  zone: MtfDumpZoneSpec | null,
  sfpPrice: number | null,
  atr: number,
  requireZone = true
): number | null {
  if (!(entry > 0) || !(atr > 0)) return null;
  if (requireZone && !zone) return null;
  if (direction === 'LONG') {
    const floor = zone ? Math.min(zone.bot, zone.mid) : entry - atr;
    const sweep = sfpPrice != null ? sfpPrice - atr * 0.15 : floor;
    const sl = Math.min(entry - atr * 0.35, sweep, floor - atr * 0.05);
    if (!(sl > 0) || !(sl < entry)) return null;
    return sl;
  }
  const ceil = zone ? Math.max(zone.top, zone.mid) : entry + atr;
  const sweep = sfpPrice != null ? sfpPrice + atr * 0.15 : ceil;
  const sl = Math.max(entry + atr * 0.35, sweep, ceil + atr * 0.05);
  if (!(sl > entry)) return null;
  return sl;
}

/**
 * 로켓 구조 SL + 폭락존 SL 합류 (차트 신호봉 고/저 무효화 + 존 바깥).
 * - 노이즈(ATR×0.2) 안쪽 SL은 버림
 * - 둘 다 있으면 더 넓은 구조 무효화(승률·스윕 여유) 우선
 * - ATR×2.8 넘으면 초단용으로 더 가까운 쪽 선택(RR 유지)
 * 확정 승률 아님.
 */
export function blendRocketZoneSl(
  entry: number,
  direction: 'LONG' | 'SHORT',
  zoneSl: number | null,
  rocketSl: number | null,
  atr: number
): number | null {
  if (!(entry > 0) || !(atr > 0)) return zoneSl ?? rocketSl ?? null;
  const minDist = atr * 0.2;
  const maxDist = atr * 2.8;
  const ok = (sl: number) =>
    direction === 'LONG' ? sl > 0 && sl < entry - minDist : sl > entry + minDist;
  const zs = zoneSl != null && ok(zoneSl) ? zoneSl : null;
  const rs = rocketSl != null && ok(rocketSl) ? rocketSl : null;
  if (rs == null && zs == null) return null;
  if (rs == null) return zs;
  if (zs == null) return rs;
  let pick = direction === 'LONG' ? Math.min(rs, zs) : Math.max(rs, zs);
  if (Math.abs(entry - pick) > maxDist) {
    pick = direction === 'LONG' ? Math.max(rs, zs) : Math.min(rs, zs);
    if (!ok(pick)) {
      pick = direction === 'LONG' ? entry - minDist : entry + minDist;
    }
  }
  return pick;
}

function findArmedDump(
  candles: Candle[],
  dumps: MtfDumpZoneSpec[]
): { zone: MtfDumpZoneSpec; direction: 'LONG' | 'SHORT' } | null {
  const last = candles[candles.length - 1];
  const prev = candles[candles.length - 2];
  if (!last) return null;
  /** 마감봉 기준 — 형성봉만이면 prev 우선 */
  const bar = last;
  for (const z of dumps) {
    if (!(z.top > 0 && z.bot > 0)) continue;
    if (!candleTouchesZone(bar, z.bot, z.top) && !(prev && candleTouchesZone(prev, z.bot, z.top))) {
      continue;
    }
    if (dumpLongBias(z) && !dumpShortBias(z)) return { zone: z, direction: 'LONG' };
    if (dumpShortBias(z) && !dumpLongBias(z)) return { zone: z, direction: 'SHORT' };
    /** 양면이면 floor→롱 ceiling→숏 */
    if (z.bandRole === 'ceiling') return { zone: z, direction: 'SHORT' };
    return { zone: z, direction: 'LONG' };
  }
  return null;
}

export function emptyAutoScalpSnapshot(strip = '자동초단 · 대기'): AutoScalpEngineSnapshot {
  return {
    trade: null,
    events: [],
    stripKo: strip,
    detailKo: '폭락존→SFP→로켓(+4전략/독수리) 합류 시 진입 · 존SL·R&R 필수 · 확정 아님',
  };
}

/**
 * 한 틱(봉 갱신)마다 호출. prev 상태를 받아 다음 상태·이벤트를 반환.
 * 봉 마감 확정만 진입(lastClosed = candles[n-2] 또는 isClosed).
 */
export function stepMergedDeskAutoScalp(params: {
  symbol: string;
  timeframe: string;
  candles: Candle[];
  dumpZones: MtfDumpZoneSpec[] | null | undefined;
  geom: MergedDeskChannelGeom | null | undefined;
  rocketDir: 'LONG' | 'SHORT' | null | undefined;
  /** 마지막 봉 구조로켓 stopLoss (analyze) — FIRE 시 존SL과 합류 */
  rocketStopLoss?: number | null;
  prev: AutoScalpPaperTrade | null;
  leverage?: number;
  maxBars?: number;
  tp1Frac?: number;
  /** 목표 ROE 소수 (0.05=5%). 미지정 시 5%/10% */
  tp1RoeCap?: number;
  tp2RoeCap?: number;
  tp3RoeCap?: number;
  exitMode?: ScalpExitMode;
  /** TP1 후 잠금 ROE 소수 (0.02=2%) */
  lockRoeCap?: number;
  /** 존 SL 필수 (기본 true) */
  requireZoneSl?: boolean;
  /** 최소 R:R (기본 1.2) */
  minRr?: number;
  /** true면 마지막 봉을 마감으로 취급(백테스트). 라이브는 false → n-2 */
  treatLastClosed?: boolean;
}): AutoScalpEngineSnapshot {
  const candles = params.candles;
  const n = candles.length;
  if (n < 8) return emptyAutoScalpSnapshot('자동초단 · 데이터부족');

  const lev = Math.max(1, Math.min(125, params.leverage ?? DEFAULT_LEV));
  const exitMode: ScalpExitMode = params.exitMode || 'TP1_CUT';
  const lockRoeCap = Math.max(0.005, Math.min(0.05, params.lockRoeCap ?? 0.02));
  const roeCaps = resolveUltraScalpRoeCaps({
    leverage: lev,
    tp1RoePct: (params.tp1RoeCap ?? TP1_ROE_CAP) * 100,
    tp2RoePct: (params.tp2RoeCap ?? TP2_ROE_CAP) * 100,
  });
  const tp1RoeCap = roeCaps.tp1Roe;
  const tp2RoeCap = roeCaps.tp2Roe;
  const tp3RoeCap = Math.max(
    tp2RoeCap + 0.01,
    Math.min(0.2, params.tp3RoeCap ?? tp2RoeCap + 0.02)
  );
  const maxBars = params.maxBars ?? DEFAULT_MAX_BARS;
  const tp1Frac =
    exitMode === 'TP1_CUT'
      ? 1
      : Math.min(0.7, Math.max(0.4, params.tp1Frac ?? TP1_FRAC));
  const tp2Frac = exitMode === 'TP3_RUNNER' ? 0.3 : 0;
  const atr = atr14(candles);
  const iClosed = params.treatLastClosed ? n - 1 : Math.max(0, n - 2);
  const closed = candles[iClosed]!;
  const closePx = Number(closed.close) || 0;
  const closeTime = Number(closed.time) || Date.now() / 1000;
  const events: AutoScalpJournalEvent[] = [];
  const dumps = params.dumpZones ?? [];
  const geom = params.geom ?? null;
  const rocket = params.rocketDir ?? null;

  let trade = params.prev ? { ...params.prev } : null;

  /** 종료된 트레이드는 새 사이클만 */
  if (trade && trade.phase === 'CLOSED') {
    trade = null;
  }

  const push = (
    kind: AutoScalpJournalEvent['kind'],
    noteKo: string,
    direction: 'LONG' | 'SHORT' | 'NEUTRAL',
    price: number,
    tradeId: string,
    meta?: AutoScalpJournalEvent['meta']
  ) => {
    events.push({ kind, at: Date.now(), direction, price, noteKo, tradeId, meta });
  };

  /** ——— 관리: OPEN / TP1 / BE ——— */
  if (trade && (trade.phase === 'OPEN' || trade.phase === 'TP1_HIT' || trade.phase === 'BE')) {
    if (trade.entryBarTime != null && Number(closed.time) !== trade.entryBarTime) {
      trade.barsHeld += 1;
    }
    const entry = trade.entry!;
    const dir = trade.direction;
    const hi = Number(closed.high);
    const lo = Number(closed.low);
    const fav = dir === 'LONG' ? hi : lo;
    const adv = dir === 'LONG' ? lo : hi;
    const mfe = priceMoveToRoePct(entry, fav, dir, lev);
    const mae = priceMoveToRoePct(entry, adv, dir, lev);
    trade.mfeRoePct = Math.max(trade.mfeRoePct, mfe);
    trade.maeRoePct = Math.min(trade.maeRoePct, mae);

    const activeSl = trade.activeSl ?? trade.sl!;
    const hitSl =
      dir === 'LONG' ? lo <= activeSl : hi >= activeSl;
    const hitTp1 =
      trade.phase === 'OPEN' && trade.tp1 != null
        ? dir === 'LONG'
          ? hi >= trade.tp1
          : lo <= trade.tp1
        : false;
    const hitTp2 =
      (trade.phase === 'TP1_HIT' || trade.phase === 'BE') && trade.tp2 != null
        ? dir === 'LONG'
          ? hi >= trade.tp2
          : lo <= trade.tp2
        : false;
    const hitTp3 =
      (trade.phase === 'TP1_HIT' || trade.phase === 'BE') &&
      trade.exitMode === 'TP3_RUNNER' &&
      trade.tp3 != null &&
      (trade.remainingFrac > 0)
        ? dir === 'LONG'
          ? hi >= trade.tp3
          : lo <= trade.tp3
        : false;

    if (hitSl) {
      const exit = activeSl;
      const locked = trade.profitLocked === true || trade.phase === 'BE' || trade.phase === 'TP1_HIT';
      const roe = priceMoveToRoePct(entry, exit, dir, lev) - FEE_RT * lev * trade.remainingFrac;
      trade.realizedRoePct += roe * trade.remainingFrac;
      trade.remainingFrac = 0;
      trade.closeReason = locked
        ? Math.abs(exit - entry) / entry > 1e-6
          ? 'LOCK_STOP'
          : 'BE_STOP'
        : 'SL';
      trade.phase = 'CLOSED';
      trade.closedAt = Date.now();
      trade.noteKo = `${dir} ${trade.closeReason} · ROE합 ${(trade.realizedRoePct * 100).toFixed(1)}%`;
      push(
        locked ? 'AUTO_SCALP_CLOSE' : 'AUTO_SCALP_SL',
        trade.noteKo,
        dir,
        exit,
        trade.id,
        { roe: trade.realizedRoePct, reason: trade.closeReason, outcome: trade.realizedRoePct >= 0 ? 'SUCCESS' : 'FAIL' }
      );
      return {
        trade,
        events,
        stripKo: `자동초단 · ${trade.closeReason}`,
        detailKo: trade.noteKo,
      };
    }

    if (hitTp1 && trade.tp1 != null) {
      const exit = trade.tp1;
      if (trade.exitMode === 'TP1_CUT' || tp1Frac >= 0.99) {
        const roe = priceMoveToRoePct(entry, exit, dir, lev) - FEE_RT * lev;
        trade.realizedRoePct += roe;
        trade.remainingFrac = 0;
        trade.phase = 'CLOSED';
        trade.closeReason = 'TP1_FULL';
        trade.closedAt = Date.now();
        trade.noteKo = `TP1컷 전량 · ROE ${(roe * 100).toFixed(1)}%`;
        push('AUTO_SCALP_TP1', trade.noteKo, dir, exit, trade.id, {
          frac: 1,
          roe,
          outcome: 'SUCCESS',
        });
        return {
          trade,
          events,
          stripKo: '자동초단 · TP1컷완료',
          detailKo: trade.noteKo,
        };
      }
      const useFrac = trade.tp1Frac || tp1Frac;
      const roe = priceMoveToRoePct(entry, exit, dir, lev) - FEE_RT * lev * useFrac;
      trade.realizedRoePct += roe * useFrac;
      trade.remainingFrac = 1 - useFrac;
      trade.phase = 'TP1_HIT';
      const lockPx = roeTargetPrice(entry, dir, lev, trade.lockRoePct ?? lockRoeCap);
      trade.activeSl = lockPx;
      trade.profitLocked = true;
      trade.noteKo = `TP1 ${(useFrac * 100).toFixed(0)}% · ROE ${(roe * 100).toFixed(1)}% · 잠금+${(
        (trade.lockRoePct ?? lockRoeCap) * 100
      ).toFixed(1)}%`;
      push('AUTO_SCALP_TP1', trade.noteKo, dir, exit, trade.id, {
        frac: useFrac,
        roe,
        outcome: 'PARTIAL',
      });
      push('AUTO_SCALP_BE', `SL→잠금 ${lockPx.toFixed(0)}`, dir, lockPx, trade.id);
      trade.phase = 'BE';
    } else if (
      hitTp2 &&
      trade.tp2 != null &&
      trade.exitMode === 'TP3_RUNNER' &&
      (trade.tp2Frac || tp2Frac) > 0 &&
      trade.remainingFrac > (trade.tp2Frac || tp2Frac) + 0.01
    ) {
      const exit = trade.tp2;
      const f2 = Math.min(trade.remainingFrac - 0.01, trade.tp2Frac || tp2Frac);
      const roe = priceMoveToRoePct(entry, exit, dir, lev) - FEE_RT * lev * f2;
      trade.realizedRoePct += roe * f2;
      trade.remainingFrac -= f2;
      trade.activeSl = exit;
      trade.profitLocked = true;
      trade.noteKo = `TP2 ${(f2 * 100).toFixed(0)}% · 잔량→TP3 · ROE합 ${(trade.realizedRoePct * 100).toFixed(1)}%`;
      push('AUTO_SCALP_TP2', trade.noteKo, dir, exit, trade.id, { frac: f2, roe, outcome: 'PARTIAL' });
    } else if (hitTp2 && trade.tp2 != null && trade.exitMode !== 'TP3_RUNNER') {
      const exit = trade.tp2;
      const roe = priceMoveToRoePct(entry, exit, dir, lev) - FEE_RT * lev * trade.remainingFrac;
      trade.realizedRoePct += roe * trade.remainingFrac;
      trade.remainingFrac = 0;
      trade.phase = 'CLOSED';
      trade.closeReason = 'TP2';
      trade.closedAt = Date.now();
      trade.noteKo = `TP2 잔량 · ROE합 ${(trade.realizedRoePct * 100).toFixed(1)}%`;
      push('AUTO_SCALP_TP2', trade.noteKo, dir, exit, trade.id, {
        roe: trade.realizedRoePct,
        outcome: 'SUCCESS',
      });
      return {
        trade,
        events,
        stripKo: '자동초단 · TP2완료',
        detailKo: trade.noteKo,
      };
    } else if (hitTp3 && trade.tp3 != null) {
      const exit = trade.tp3;
      const roe = priceMoveToRoePct(entry, exit, dir, lev) - FEE_RT * lev * trade.remainingFrac;
      trade.realizedRoePct += roe * trade.remainingFrac;
      trade.remainingFrac = 0;
      trade.phase = 'CLOSED';
      trade.closeReason = 'TP3';
      trade.closedAt = Date.now();
      trade.noteKo = `TP3 잔량 · ROE합 ${(trade.realizedRoePct * 100).toFixed(1)}%`;
      push('AUTO_SCALP_TP2', trade.noteKo, dir, exit, trade.id, {
        roe: trade.realizedRoePct,
        outcome: 'SUCCESS',
      });
      return {
        trade,
        events,
        stripKo: '자동초단 · TP3완료',
        detailKo: trade.noteKo,
      };
    } else if (trade.barsHeld >= maxBars) {
      const exit = closePx;
      const roe = priceMoveToRoePct(entry, exit, dir, lev) - FEE_RT * lev * trade.remainingFrac;
      trade.realizedRoePct += roe * trade.remainingFrac;
      trade.remainingFrac = 0;
      trade.phase = 'CLOSED';
      trade.closeReason = 'TIME_STOP';
      trade.closedAt = Date.now();
      trade.noteKo = `시간손절 ${maxBars}봉 · ROE합 ${(trade.realizedRoePct * 100).toFixed(1)}%`;
      push('AUTO_SCALP_TIME', trade.noteKo, dir, exit, trade.id, { roe: trade.realizedRoePct });
      return {
        trade,
        events,
        stripKo: '자동초단 · 시간손절',
        detailKo: trade.noteKo,
      };
    }

    return {
      trade,
      events,
      stripKo:
        trade.phase === 'BE' || trade.phase === 'TP1_HIT'
          ? `자동초단 · BE·TP2대기 · ROE ${(trade.realizedRoePct * 100).toFixed(1)}%`
          : `자동초단 · OPEN ${trade.direction}`,
      detailKo: trade.noteKo,
    };
  }

  /** ——— Arm / SFP / Rocket / Fire ——— */
  const sfp = geom ? detectRbRailSfp(candles.slice(0, iClosed + 1), geom, atr) : null;
  const sfpDir: 'LONG' | 'SHORT' | null =
    sfp?.side === 'bull' ? 'LONG' : sfp?.side === 'bear' ? 'SHORT' : null;

  if (!trade || trade.phase === 'IDLE') {
    const hit = findArmedDump(candles.slice(0, iClosed + 1), dumps);
    if (!hit) {
      return emptyAutoScalpSnapshot('자동초단 · 폭락터치 대기');
    }
    const id = uid('as');
    trade = {
      id,
      symbol: params.symbol,
      timeframe: params.timeframe,
      direction: hit.direction,
      phase: 'ARMED',
      armedAt: Date.now(),
      armedZoneId: zoneId(hit.zone),
      armedZoneMid: hit.zone.mid,
      sfpAt: null,
      sfpPrice: null,
      rocketAt: null,
      entryBarTime: null,
      entry: null,
      sl: null,
      activeSl: null,
      tp1: null,
      tp2: null,
      tp3: null,
      leverage: lev,
      tp1Frac,
      tp2Frac,
      realizedRoePct: 0,
      remainingFrac: 1,
      barsHeld: 0,
      maxBars,
      closeReason: null,
      closedAt: null,
      noteKo: `Arm · ${hit.zone.labelKo} · ${hit.direction}`,
      mfeRoePct: 0,
      maeRoePct: 0,
      exitMode,
      lockRoePct: lockRoeCap,
      profitLocked: false,
    };
    push('AUTO_SCALP_ARM', trade.noteKo, hit.direction, hit.zone.mid, id, {
      zoneId: trade.armedZoneId,
    });
  }

  if (trade.phase === 'ARMED') {
    if (sfpDir === trade.direction) {
      trade.phase = 'SFP_OK';
      trade.sfpAt = Date.now();
      trade.sfpPrice = sfp!.price;
      trade.noteKo = `SFP ${trade.direction} · ${sfp!.price.toFixed(0)}`;
      push('AUTO_SCALP_SFP', trade.noteKo, trade.direction, sfp!.price, trade.id);
    } else {
      /** Arm 만료: 새 터치 없으면 유지, 방향 반대 폭락이면 리셋 */
      const hit = findArmedDump(candles.slice(0, iClosed + 1), dumps);
      if (hit && hit.direction !== trade.direction) {
        trade.phase = 'CLOSED';
        trade.closeReason = 'INVALID';
        trade.closedAt = Date.now();
        trade.noteKo = 'Arm 무효 · 반대 폭락';
        push('AUTO_SCALP_CLOSE', trade.noteKo, 'NEUTRAL', closePx, trade.id);
        return {
          trade,
          events,
          stripKo: '자동초단 · Arm무효',
          detailKo: trade.noteKo,
        };
      }
      return {
        trade,
        events,
        stripKo: `자동초단 · Arm · SFP대기(${trade.direction})`,
        detailKo: trade.noteKo,
      };
    }
  }

  if (trade.phase === 'SFP_OK') {
    if (rocket === trade.direction) {
      trade.phase = 'READY';
      trade.rocketAt = Date.now();
      trade.noteKo = `로켓 ${trade.direction} 합류 · FIRE대기`;
      push('AUTO_SCALP_ROCKET', trade.noteKo, trade.direction, closePx, trade.id);
    } else {
      return {
        trade,
        events,
        stripKo: `자동초단 · SFP · 로켓대기(${trade.direction})`,
        detailKo: trade.noteKo,
      };
    }
  }

  if (trade.phase === 'READY') {
    /** 봉 마감 종가 진입 — Arm→SFP→로켓 합류 후 */
    const entry = closePx;
    const costGate = ultraScalpCostGatePass({
      leverage: lev,
      tp1RoePct: tp1RoeCap * 100,
    });
    if (!costGate.ok) {
      trade.phase = 'CLOSED';
      trade.closeReason = 'COST';
      trade.closedAt = Date.now();
      trade.noteKo = costGate.reasonKo;
      push('AUTO_SCALP_CLOSE', trade.noteKo, trade.direction, entry, trade.id);
      return {
        trade,
        events,
        stripKo: '자동초단 · 비용스킵',
        detailKo: trade.noteKo,
      };
    }
    const armedZone =
      dumps.find((z) => zoneId(z) === trade!.armedZoneId) ??
      dumps.find((z) => Math.abs(z.mid - trade!.armedZoneMid) / Math.max(1, trade!.armedZoneMid) < 0.002) ??
      null;
    const requireZoneSl = params.requireZoneSl !== false;
    const minRr = Math.max(1, Math.min(3, params.minRr ?? 1.2));
    const zoneSl = structureSl(entry, trade.direction, armedZone, trade.sfpPrice, atr, requireZoneSl);
    const rocketSl =
      params.rocketStopLoss != null && params.rocketStopLoss > 0 ? params.rocketStopLoss : null;
    const sl = blendRocketZoneSl(entry, trade.direction, zoneSl, rocketSl, atr);
    if (sl == null) {
      trade.phase = 'CLOSED';
      trade.closeReason = 'INVALID';
      trade.closedAt = Date.now();
      trade.noteKo = requireZoneSl
        ? '존SL없음 · 진입스킵 (폭락존 손절 필수)'
        : '구조SL없음 · 진입스킵 (로켓/존 손절 필요)';
      push('AUTO_SCALP_CLOSE', trade.noteKo, trade.direction, entry, trade.id);
      return {
        trade,
        events,
        stripKo: '자동초단 · 존SL필수',
        detailKo: trade.noteKo,
      };
    }
    const slTag =
      rocketSl != null && Math.abs(sl - rocketSl) / Math.max(1, atr) < 0.05
        ? '로켓SL'
        : zoneSl != null && Math.abs(sl - zoneSl) / Math.max(1, atr) < 0.05
          ? '존SL'
          : '로켓+존SL';
    const tp1 = structureTp(entry, trade.direction, armedZone, geom, atr, tp1RoeCap, lev);
    const tp2 = structureTp(entry, trade.direction, armedZone, geom, atr, tp2RoeCap, lev);
    const tp3 = structureTp(entry, trade.direction, armedZone, geom, atr, tp3RoeCap, lev);
    /** RR 게이트 */
    const risk = Math.abs(entry - sl);
    const reward1 = Math.abs(tp1 - entry);
    if (!(risk > 0) || reward1 / risk < minRr) {
      trade.phase = 'CLOSED';
      trade.closeReason = 'INVALID';
      trade.closedAt = Date.now();
      trade.noteKo = `RR부족(<${minRr}) · 페이퍼 스킵`;
      push('AUTO_SCALP_CLOSE', trade.noteKo, trade.direction, entry, trade.id);
      return {
        trade,
        events,
        stripKo: '자동초단 · RR스킵',
        detailKo: trade.noteKo,
      };
    }
    trade.phase = 'OPEN';
    trade.entry = entry;
    trade.sl = sl;
    trade.activeSl = sl;
    trade.tp1 = tp1;
    trade.tp2 = dirEnsureOrder(trade.direction, tp1, tp2);
    trade.tp3 = dirEnsureOrder(trade.direction, trade.tp2, tp3);
    trade.exitMode = exitMode;
    trade.lockRoePct = lockRoeCap;
    trade.tp1Frac = tp1Frac;
    trade.tp2Frac = tp2Frac;
    trade.entryBarTime = closeTime;
    trade.remainingFrac = 1;
    trade.noteKo = `FIRE ${trade.direction} E${entry.toFixed(0)} ${slTag}${sl.toFixed(0)} TP1${tp1.toFixed(0)} TP2${trade.tp2.toFixed(0)}${
      exitMode === 'TP3_RUNNER' ? ` TP3${trade.tp3.toFixed(0)}` : ''
    } · Arm→SFP→로켓 · ${exitMode} · ${lev}x`;
    push('AUTO_SCALP_FIRE', trade.noteKo, trade.direction, entry, trade.id, {
      sl,
      tp1,
      tp2: trade.tp2,
      tp3: trade.tp3,
      lev,
      tp1Frac,
      exitMode,
      zoneSl: true,
      rocketSl: rocketSl != null,
    });
    return {
      trade,
      events,
      stripKo: `자동초단 · FIRE ${trade.direction}`,
      detailKo: trade.noteKo,
    };
  }

  return {
    trade,
    events,
    stripKo: trade ? `자동초단 · ${trade.phase}` : '자동초단 · 대기',
    detailKo: trade?.noteKo || '',
  };
}

function dirEnsureOrder(direction: 'LONG' | 'SHORT', tp1: number, tp2: number): number {
  if (direction === 'LONG') return Math.max(tp1, tp2);
  return Math.min(tp1, tp2);
}

/** 종료 트레이드 기대값 요약 */
export function summarizeAutoScalpTrades(trades: AutoScalpPaperTrade[]): {
  n: number;
  winN: number;
  avgRoe: number | null;
  expectancyKo: string;
} {
  const closed = trades.filter((t) => t.phase === 'CLOSED' && t.closeReason && t.closeReason !== 'INVALID');
  const n = closed.length;
  if (!n) return { n: 0, winN: 0, avgRoe: null, expectancyKo: '표본 없음 · 페이퍼만' };
  const winN = closed.filter((t) => t.realizedRoePct > 0).length;
  const avgRoe = closed.reduce((s, t) => s + t.realizedRoePct, 0) / n;
  return {
    n,
    winN,
    avgRoe,
    expectancyKo: `n=${n} · 이익 ${winN} · 평균ROE ${(avgRoe * 100).toFixed(2)}% · 확정아님`,
  };
}
