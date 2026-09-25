/**
 * 수익패턴 → 타점 자동 FIRE 후보 (경로 C).
 * 전코인 · 메이커 · 일일캡 · 롱만 · 비중캡.
 */
import type { Candle } from '@/types';
import { ppDayCapCanEnter, ppDayCapWhyKo } from '@/lib/profitPattern15m/dayCap';
import {
  PP_MONITOR_LEVERAGE,
  resolveProfitPatternMonitor,
} from '@/lib/profitPattern15m/liveSignal';
import {
  PP_PAPER_POLICY_KO,
  ppDirectionAllowed,
  ppDirectionWhyKo,
} from '@/lib/profitPattern15m/paperPolicy';
import {
  PROFIT_PATTERN_CALLSIGN,
  PROFIT_PATTERN_ENGINE_ID,
  PROFIT_PATTERN_HOCHUNG,
  PROFIT_PATTERN_SKILL_ID,
} from '@/lib/profitPattern15m/skill';

export type PpAutoEntryResult = {
  ok: boolean;
  direction: 'LONG' | 'SHORT' | null;
  entry: number | null;
  sl: number | null;
  tp: number | null;
  slRoePct: number | null;
  tpRoePct: number | null;
  leverage: number;
  reasonKo: string;
  lane: string;
  eventId: string | null;
  paperOnly: boolean;
  allowLive: boolean;
  sizeScale: number;
  lineEntryKo?: string;
  lineSlKo?: string;
  lineTpKo?: string;
};

export function resolveProfitPatternAutoEntry(params: {
  symbol: string;
  candles15m?: Candle[] | null;
  leverage?: number;
}): PpAutoEntryResult {
  const mon = resolveProfitPatternMonitor({
    symbol: params.symbol,
    timeframe: '15m',
    candles: params.candles15m || [],
  });
  const lev = Math.max(1, Number(params.leverage) || PP_MONITOR_LEVERAGE);
  const nowSec = Math.floor(Date.now() / 1000);

  const fail = (reasonKo: string): PpAutoEntryResult => ({
    ok: false,
    direction: mon.direction,
    entry: mon.entry,
    sl: mon.sl,
    tp: mon.tp,
    slRoePct: null,
    tpRoePct: null,
    leverage: lev,
    reasonKo,
    lane: PROFIT_PATTERN_ENGINE_ID,
    eventId: null,
    paperOnly: true,
    allowLive: false,
    sizeScale: mon.sizeScale || 0,
    lineEntryKo: mon.lineEntryKo,
    lineSlKo: mon.lineSlKo,
    lineTpKo: mon.lineTpKo,
  });

  if (mon.status !== 'SIGNAL' || !mon.direction || mon.entry == null || mon.sl == null || mon.tp == null) {
    return fail(mon.reasonKo || `${PROFIT_PATTERN_HOCHUNG} · WAIT`);
  }
  if (!ppDirectionAllowed(mon.direction)) {
    return fail(`${PROFIT_PATTERN_HOCHUNG} · ${ppDirectionWhyKo(mon.direction)}`);
  }
  if (!(mon.sizeScale > 0)) {
    return fail(`${PROFIT_PATTERN_HOCHUNG} · 비중캡 미달 · 미진입`);
  }
  if (!ppDayCapCanEnter(params.symbol, nowSec)) {
    return fail(`${PROFIT_PATTERN_HOCHUNG} · ${ppDayCapWhyKo(params.symbol, nowSec)}`);
  }

  const entry = mon.entry;
  const sl = mon.sl;
  const tp = mon.tp;
  const risk = Math.abs(entry - sl);
  const reward = Math.abs(tp - entry);
  const scale = mon.sizeScale;
  const slRoe =
    risk > 0 && entry > 0
      ? (risk / entry) * PP_MONITOR_LEVERAGE * 100 * scale
      : null;
  const tpRoe =
    reward > 0 && entry > 0
      ? (reward / entry) * PP_MONITOR_LEVERAGE * 100 * scale
      : null;

  return {
    ok: true,
    direction: mon.direction,
    entry,
    sl,
    tp,
    slRoePct: slRoe,
    tpRoePct: tpRoe,
    leverage: PP_MONITOR_LEVERAGE,
    reasonKo: `${PROFIT_PATTERN_HOCHUNG}(${PROFIT_PATTERN_CALLSIGN}) · ${mon.lineEntryKo} · ${mon.symbol} · 비중×${scale} · 경로C · ${PP_PAPER_POLICY_KO}`.slice(
      0,
      220
    ),
    lane: PROFIT_PATTERN_ENGINE_ID,
    eventId: `${PROFIT_PATTERN_SKILL_ID}-${mon.symbol}-${mon.barTime}-${mon.direction}`,
    paperOnly: false,
    allowLive: true,
    sizeScale: scale,
    lineEntryKo: mon.lineEntryKo,
    lineSlKo: mon.lineSlKo,
    lineTpKo: mon.lineTpKo,
  };
}
