/**
 * 가상·실전 공통 — 분·시·일·주·월 스스로 감시.
 * 게이트: RR≥2 · 기대 ROE 5~7% · TP1에서 수량 50% 익절 설계.
 * 분석 동일 · 실행만 가상/실전 분기. 확정 수익·승률 아님.
 */
import type { Candle } from '@/types';
import { normalizeChartTimeframe } from '@/lib/constants';
import { fetchClientMarketCandles } from '@/lib/clientMarketCandleCache';
import { MERGED_DESK_CHART_TIMEFRAMES } from '@/lib/mergedDesk4hReference';
import { readAutoTradeConfig } from '@/lib/mergedDeskAutoTradeConfig';
import {
  readVirtualTradeSession,
  canVirtualReentryNow,
  type VirtualEntrySource,
} from '@/lib/mergedDeskVirtualTradeSession';
import {
  executeUnifiedAnalysisEntry,
  resolveUnifiedTradeMode,
} from '@/lib/mergedDeskUnifiedAnalysisEntry';

/** 감시 TF — 차트 지원 전 구간 */
export const VIRTUAL_MTF_WATCH_TFS: readonly string[] = MERGED_DESK_CHART_TIMEFRAMES.filter(
  (tf) => ['1m', '3m', '5m', '15m', '1h', '4h', '1d', '1w', '1M'].includes(tf)
);

const MIN_RR = 2;
const ROE_MIN = 0.05;
const ROE_MAX = 0.07;
const ROE_TARGET = 0.06; /** 중앙 6% */
/** TP1 청산 비중 50% */
export const VIRTUAL_TP1_FRAC = 0.5;

export type VirtualMtfCandidate = {
  tf: string;
  direction: 'LONG' | 'SHORT';
  entry: number;
  sl: number;
  tp1: number;
  rr: number;
  expectRoePct: number;
  reasonKo: string;
};

function swingLow(candles: Candle[], from: number, to: number): number {
  let lo = Infinity;
  for (let i = from; i <= to; i++) {
    const c = candles[i];
    if (c && Number.isFinite(c.low)) lo = Math.min(lo, c.low);
  }
  return lo;
}

function swingHigh(candles: Candle[], from: number, to: number): number {
  let hi = -Infinity;
  for (let i = from; i <= to; i++) {
    const c = candles[i];
    if (c && Number.isFinite(c.high)) hi = Math.max(hi, c.high);
  }
  return hi;
}

/**
 * 구조 SL + 기대 ROE 5~7% TP1.
 * TP1은 ROE≈6% 가격 · 그때 RR≥2 인 경우만 (손절이 너무 멀면 스킵).
 * TP1 청산 설계 비중 50%.
 */
export function evaluateVirtualMtfSetup(
  candles: Candle[],
  tf: string,
  leverage: number
): VirtualMtfCandidate | null {
  if (candles.length < 30) return null;
  const lev = Math.max(1, Math.min(125, leverage || 10));
  const n = candles.length;
  const last = candles[n - 1]!;
  const entry = Number(last.close);
  if (!(entry > 0)) return null;

  const look = Math.min(24, Math.floor(n / 3));
  const i0 = Math.max(0, n - 2 - look);
  const i1 = n - 2;
  const lo = swingLow(candles, i0, i1);
  const hi = swingHigh(candles, i0, i1);
  if (!(lo < Infinity && hi > -Infinity)) return null;

  const prev = candles[n - 2]!;
  const bullish = last.close >= last.open && last.close >= (prev?.close ?? last.close);
  const bearish = last.close <= last.open && last.close <= (prev?.close ?? last.close);
  const moveFrac = ROE_TARGET / lev;
  const candidates: VirtualMtfCandidate[] = [];

  const pushIfOk = (
    direction: 'LONG' | 'SHORT',
    sl: number,
    tp1: number,
    risk: number,
    reward: number
  ) => {
    if (!(risk > 0 && reward > 0)) return;
    const rr = reward / risk;
    const expectRoePct = (reward / entry) * lev;
    if (rr < MIN_RR) return;
    if (expectRoePct < ROE_MIN - 1e-9 || expectRoePct > ROE_MAX + 1e-9) return;
    candidates.push({
      tf,
      direction,
      entry,
      sl,
      tp1,
      rr,
      expectRoePct,
      reasonKo: `${tf} ${direction === 'LONG' ? '롱' : '숏'} · RR ${rr.toFixed(2)} · ROE≈${(expectRoePct * 100).toFixed(1)}% · TP1 ${VIRTUAL_TP1_FRAC * 100}%`,
    });
  };

  if (bullish && lo < entry) {
    const sl = lo * 0.999;
    const risk = entry - sl;
    const tp1 = entry * (1 + moveFrac);
    pushIfOk('LONG', sl, tp1, risk, tp1 - entry);
  }
  if (bearish && hi > entry) {
    const sl = hi * 1.001;
    const risk = sl - entry;
    const tp1 = entry * (1 - moveFrac);
    pushIfOk('SHORT', sl, tp1, risk, entry - tp1);
  }

  if (!candidates.length) return null;
  candidates.sort((a, b) => b.rr - a.rr || b.expectRoePct - a.expectRoePct);
  return candidates[0]!;
}

export type VirtualMtfScanResult = {
  scanned: string[];
  best: VirtualMtfCandidate | null;
  notes: string[];
};

/**
 * 전 TF 캔들 조회 후 RR·ROE 게이트. 가상세션 ARM + 미포지션일 때 호출.
 */
export async function scanVirtualMtfSetups(params: {
  symbol: string;
  source?: string;
  signal?: AbortSignal;
}): Promise<VirtualMtfScanResult> {
  const cfg = readAutoTradeConfig();
  const lev = cfg.leverage || 10;
  const notes: string[] = [];
  const scanned: string[] = [];
  let best: VirtualMtfCandidate | null = null;

  for (const tfRaw of VIRTUAL_MTF_WATCH_TFS) {
    if (params.signal?.aborted) break;
    const tf = normalizeChartTimeframe(tfRaw);
    scanned.push(tf);
    try {
      const candles = await fetchClientMarketCandles({
        symbol: params.symbol,
        timeframe: tf,
        source: params.source || 'bitget',
        signal: params.signal,
        maxAgeMs: 15_000,
      });
      const hit = evaluateVirtualMtfSetup(candles, tf, lev);
      if (!hit) continue;
      if (!best || hit.rr > best.rr) best = hit;
    } catch (e) {
      notes.push(`${tf} 조회실패`);
    }
  }

  if (best) {
    notes.push(`후보 ${best.reasonKo}`);
  } else {
    notes.push('전 TF · RR≥2 & ROE 5~7% 구간 없음 · 대기');
  }
  return { scanned, best, notes };
}

/**
 * 스캔 후 조건 맞으면 가상/실전 동일 분석으로 진입 1회.
 * 익절 후 reentryWatch 있으면 같은 방향 + 눌림만 (추격 금지).
 */
export async function tryVirtualMtfEntry(params: {
  symbol: string;
  source?: string;
  signal?: AbortSignal;
}): Promise<{ entered: boolean; msg: string; candidate: VirtualMtfCandidate | null }> {
  const cfg = readAutoTradeConfig();
  const virt = readVirtualTradeSession();
  const mode = resolveUnifiedTradeMode(cfg, virt.active);
  if (!mode) {
    return { entered: false, msg: '매매 ARM 없음 · 가상시작 또는 실주문ARM', candidate: null };
  }
  if (mode === 'virtual' && virt.position) {
    return { entered: false, msg: '이미 가상 포지션', candidate: null };
  }

  const watch = mode === 'virtual' ? virt.reentryWatch : null;
  const scan = await scanVirtualMtfSetups(params);
  let c = scan.best;

  if (watch) {
    if (!c || c.direction !== watch.direction) {
      let alt: VirtualMtfCandidate | null = null;
      for (const tfRaw of VIRTUAL_MTF_WATCH_TFS) {
        if (params.signal?.aborted) break;
        try {
          const candles = await fetchClientMarketCandles({
            symbol: params.symbol,
            timeframe: tfRaw,
            source: params.source || 'bitget',
            signal: params.signal,
            maxAgeMs: 15_000,
            skipFullUpgrade: true,
          });
          const hit = evaluateVirtualMtfSetup(
            candles,
            normalizeChartTimeframe(tfRaw),
            cfg.leverage || 10
          );
          if (hit && hit.direction === watch.direction) {
            if (!alt || hit.rr > alt.rr) alt = hit;
          }
        } catch {
          /* ignore */
        }
      }
      c = alt;
    }
    if (!c) {
      return {
        entered: false,
        msg: `재진입 ARM(${watch.direction}) · 같은 방향 RR·ROE 없음 · 눌림 대기`,
        candidate: null,
      };
    }
  } else if (!c) {
    return { entered: false, msg: scan.notes.join(' · '), candidate: null };
  }

  if (mode === 'virtual') {
    const gate = canVirtualReentryNow(c.entry, c.direction);
    if (!gate.ok) {
      return { entered: false, msg: gate.reasonKo, candidate: c };
    }
  }

  const isRe = Boolean(watch && watch.direction === c.direction);
  const source: VirtualEntrySource = isRe ? 'mtf-reentry' : 'mtf-rr';
  const opened = await executeUnifiedAnalysisEntry({
    mode,
    symbol: params.symbol,
    timeframe: c.tf,
    direction: c.direction,
    price: c.entry,
    sl: c.sl,
    tp: c.tp1,
    source,
    signalKo: isRe ? `재진입 · ${c.reasonKo}` : `MTF감시 · ${c.reasonKo}`,
    cfg,
    liveMark: c.entry,
    signalId: `mtf-${params.symbol}-${c.tf}-${c.direction}-${Math.round(c.entry)}`,
    availableUsdt: virt.equityUsdt,
  });
  return {
    entered: opened.ok,
    msg: opened.ok
      ? `${mode === 'live' ? '실전' : '가상'} · ${opened.msg}`
      : opened.msg || scan.notes.join(' · '),
    candidate: c,
  };
}
