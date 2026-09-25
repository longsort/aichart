/**
 * 차트 없이도 심볼(ETH 등) 폭락존 터치 감지.
 * detectMtfDumpZone + 신규터치·종가반응·지지확률≥60% → 진입.
 * 확정 수익 아님.
 */
import type { Candle } from '@/types';
import { normalizeChartTimeframe } from '@/lib/constants';
import {
  detectMtfDumpZone,
  type MtfDumpZoneSpec,
} from '@/lib/mergedDeskMtfDumpZoneBridge';
import {
  structureSl,
  structureTp,
  roeTargetPrice,
} from '@/lib/mergedDeskAutoScalpEngine';
import {
  AUTO_TRADE_SCAN_TFS,
  resolveAutoTradeTfHold,
} from '@/lib/doksuri1/autoTradeTfHoldScale';
import { listProfileLiveTfs } from '@/lib/mergedDeskCoinExitProfile';
import {
  DUMP_ZONE_HOLD_MIN_PCT,
  evaluateDumpZoneTouchProbGate,
} from '@/lib/mergedDeskDumpZoneProbGate';

/** ETH 자동매매 폭락존 스캔 TF (사용자 지정) */
export const ETH_DUMP_AUTO_TFS = ['3m', '5m', '15m'] as const;

export const ETH_DUMP_AI_ZONE_MIN_PCT = 70;
/** ETH 폭락존 터치 TP1 — ROE 5% */
export const ETH_DUMP_TP1_ROE_PCT = 5;

function candleTouchesZone(
  c: Candle,
  bot: number,
  top: number
): boolean {
  const hi = Number(c.high);
  const lo = Number(c.low);
  if (!(hi > 0) || !(lo > 0)) return false;
  return lo <= top && hi >= bot;
}

function dumpLongBias(z: MtfDumpZoneSpec): boolean {
  return z.bandRole !== 'ceiling';
}

function dumpShortBias(z: MtfDumpZoneSpec): boolean {
  return z.bandRole === 'ceiling';
}

function atrApprox(candles: Candle[]): number {
  const n = candles.length;
  if (n < 8) return Math.abs(Number(candles[n - 1]?.close) || 1) * 0.006;
  let s = 0;
  let c = 0;
  for (let i = Math.max(1, n - 14); i < n; i++) {
    const a = candles[i]!;
    const b = candles[i - 1]!;
    const tr = Math.max(
      Number(a.high) - Number(a.low),
      Math.abs(Number(a.high) - Number(b.close)),
      Math.abs(Number(a.low) - Number(b.close))
    );
    if (Number.isFinite(tr)) {
      s += tr;
      c += 1;
    }
  }
  return c > 0 ? s / c : Math.abs(Number(candles[n - 1]?.close) || 1) * 0.006;
}

export type BgDumpTouchSignal = {
  symbol: string;
  timeframe: string;
  direction: 'LONG' | 'SHORT';
  entry: number;
  sl: number;
  tp1: number;
  tp2: number;
  zoneMid: number;
  zoneBot: number;
  zoneTop: number;
  signalId: string;
  noteKo: string;
  maxBars: number;
  tp1RoePct: number;
  tp2RoePct: number;
  closedBarTime: number;
  /** AI존 롱/숏 추정 % (게이트 통과값) */
  aiZonePct?: number;
  /** 지지/거부 홀드 확률 % */
  holdPct?: number;
};

/**
 * 단일 TF: 폭락존 + 신규터치·종가·확률 게이트 통과 시 시그널.
 */
export function scanDumpTouchOnClosedBar(params: {
  symbol: string;
  timeframe: string;
  candles: Candle[];
  leverage?: number;
  minRr?: number;
  /** TP1 ROE% 고정 (ETH=5) */
  tp1RoePctOverride?: number;
  minHoldPct?: number;
}): BgDumpTouchSignal | null {
  const candles = params.candles;
  const n = candles.length;
  if (n < 16) return null;
  const tf = normalizeChartTimeframe(params.timeframe);
  const closedIdx = n - 2;
  const closed = candles[closedIdx];
  if (!closed) return null;
  const closePx = Number(closed.close);
  const closedT = Number(closed.time) || 0;
  if (!(closePx > 0) || !(closedT > 0)) return null;

  const zone = detectMtfDumpZone(candles, tf);
  if (!zone || !(zone.top > 0 && zone.bot > 0)) return null;

  let direction: 'LONG' | 'SHORT';
  if (dumpLongBias(zone) && !dumpShortBias(zone)) direction = 'LONG';
  else if (dumpShortBias(zone) && !dumpLongBias(zone)) direction = 'SHORT';
  else direction = zone.bandRole === 'ceiling' ? 'SHORT' : 'LONG';

  const bandRole: 'floor' | 'ceiling' =
    direction === 'SHORT' || zone.bandRole === 'ceiling' ? 'ceiling' : 'floor';

  const gate = evaluateDumpZoneTouchProbGate({
    candles,
    closedIdx,
    bot: zone.bot,
    top: zone.top,
    mid: zone.mid,
    bandRole,
    minHoldPct: params.minHoldPct ?? DUMP_ZONE_HOLD_MIN_PCT,
  });
  if (!gate.ok) return null;

  const atr = atrApprox(candles);
  const lev = Math.max(1, Math.min(125, params.leverage ?? 10));
  const hold = resolveAutoTradeTfHold(tf);
  let sl = structureSl(closePx, direction, zone, null, atr, true);
  if (sl == null) return null;

  const tp1RoePct =
    params.tp1RoePctOverride != null && params.tp1RoePctOverride > 0
      ? Math.max(1, Math.min(30, params.tp1RoePctOverride))
      : hold.tp1RoePct;
  const tp1Roe = tp1RoePct / 100;
  const tp2Roe = hold.tp2RoePct / 100;
  const tp1 =
    structureTp(closePx, direction, zone, null, atr, tp1Roe, lev) ||
    roeTargetPrice(closePx, direction, lev, tp1Roe);
  const tp2 =
    structureTp(closePx, direction, zone, null, atr, tp2Roe, lev) ||
    roeTargetPrice(closePx, direction, lev, tp2Roe);

  const reward = Math.abs(tp1 - closePx);
  const minRr = Math.max(1, params.minRr ?? 1.2);
  if (!(reward > 0)) return null;
  const maxRisk = reward / minRr;
  /** 고레버에서 존SL이 너무 멀면 RR 탈락 → TP 대비 SL 조임 */
  if (direction === 'LONG') {
    sl = Math.max(sl, closePx - maxRisk);
    if (!(sl > 0) || !(sl < closePx)) return null;
  } else {
    sl = Math.min(sl, closePx + maxRisk);
    if (!(sl > closePx)) return null;
  }
  const risk = Math.abs(closePx - sl);
  if (!(risk > 0) || reward / risk < minRr * 0.98) return null;

  const holdLabel = gate.labelKo;
  const signalId = `bgdump-${params.symbol}-${tf}-${direction}-${closedT}`;
  return {
    symbol: params.symbol.toUpperCase(),
    timeframe: tf,
    direction,
    entry: closePx,
    sl,
    tp1,
    tp2,
    zoneMid: zone.mid,
    zoneBot: zone.bot,
    zoneTop: zone.top,
    signalId,
    noteKo: `${params.symbol.toUpperCase().replace('USDT', '')} · ${tf} 폭락존 · ${holdLabel} · TP ROE ${tp1RoePct}%`,
    maxBars: hold.maxBars,
    tp1RoePct,
    tp2RoePct: hold.tp2RoePct,
    closedBarTime: closedT,
    holdPct: gate.holdPct ?? undefined,
  };
}

export function listBgScanTimeframes(): string[] {
  return [...AUTO_TRADE_SCAN_TFS];
}

export function listEthDumpAutoTimeframes(): string[] {
  /** 통계 프로파일 skip/prefer · 기본 3m·5m (열위 15m 배제) */
  return listProfileLiveTfs('ETHUSDT', ['3m', '5m']);
}

/** AI존 롱/숏 추정 %가 방향과 맞는지 (기본 ≥70%) */
export function ethAiZoneAllowsDirection(params: {
  direction: 'LONG' | 'SHORT';
  longPct: number;
  shortPct: number;
  minPct?: number;
}): { allow: boolean; pct: number; reasonKo: string } {
  const min = params.minPct ?? ETH_DUMP_AI_ZONE_MIN_PCT;
  const longPct = Math.max(0, Math.min(100, Number(params.longPct) || 0));
  const shortPct = Math.max(0, Math.min(100, Number(params.shortPct) || 0));
  if (params.direction === 'LONG') {
    if (longPct >= min) {
      return {
        allow: true,
        pct: longPct,
        reasonKo: `AI존 롱추정 ${longPct.toFixed(0)}%≥${min}%`,
      };
    }
    return {
      allow: false,
      pct: longPct,
      reasonKo: `AI존 롱추정 ${longPct.toFixed(0)}%<${min}% · 진입스킵`,
    };
  }
  if (shortPct >= min) {
    return {
      allow: true,
      pct: shortPct,
      reasonKo: `AI존 숏추정 ${shortPct.toFixed(0)}%≥${min}%`,
    };
  }
  return {
    allow: false,
    pct: shortPct,
    reasonKo: `AI존 숏추정 ${shortPct.toFixed(0)}%<${min}% · 진입스킵`,
  };
}
