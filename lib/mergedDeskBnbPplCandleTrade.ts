/**
 * BNB 롱숏 — Parallel Pivot Lines + 캔들분석 게이트.
 * 캔들분석 방향·존·무효 + PPL 타점(롱=PL·숏=PH) 일치 시에만 진입.
 * 기존 BNBSFP는 중지(코드 유지·미호출). 확정 승률·수익 아님.
 * analyzeCandles는 서버/API에서만 호출 — 이 모듈은 클라 번들에 fs 끌지 않음.
 *
 * PPL 수식 © LuxAlgo · CC BY-NC-SA 4.0
 */
import type { AnalyzeResponse, Candle, OverlayItem } from '@/types';
import { normalizeChartTimeframe } from '@/lib/constants';
import { computeCandleAnalysisConfirmation } from '@/lib/candleAnalysisStructureConfirm';
import {
  buildParallelPivotLines,
  nearestParallelPivotTip,
  markTouchesParallelPivot,
  type ParallelPivotLine,
} from '@/lib/mergedDeskParallelPivotLines';
import {
  assertDirectionSlTp,
  assertPivotSideForDirection,
} from '@/lib/mergedDeskDirectionSlGuard';
import { roeTargetPrice } from '@/lib/mergedDeskAutoScalpEngine';
import { listProfileLiveTfs } from '@/lib/mergedDeskCoinExitProfile';

export const BNB_PPL_SYMBOL = 'BNBUSDT';
export const BNB_PPL_AUTO_TFS = ['3m', '5m', '15m'] as const;
export const BNB_PPL_TP1_ROE_PCT = 5;

export function listBnbPplAutoTimeframes(): string[] {
  return listProfileLiveTfs(BNB_PPL_SYMBOL, ['3m', '5m', '15m']);
}

function atr14(candles: Candle[]): number {
  const n = candles.length;
  if (n < 5) return Math.abs(Number(candles[n - 1]?.close) || 1) * 0.008;
  let s = 0;
  let c = 0;
  for (let i = Math.max(1, n - 14); i < n; i++) {
    const a = candles[i]!;
    const b = candles[i - 1]!;
    s += Math.max(
      a.high - a.low,
      Math.abs(a.high - b.close),
      Math.abs(a.low - b.close)
    );
    c += 1;
  }
  return c > 0 ? s / c : Math.abs(Number(candles[n - 1]?.close) || 1) * 0.008;
}

function zoneNearTip(
  overlays: OverlayItem[] | undefined,
  direction: 'LONG' | 'SHORT',
  tip: number,
  atr: number
): { ok: boolean; mid: number; label: string } {
  if (!overlays?.length || !(tip > 0)) {
    return { ok: true, mid: tip, label: '존스킵' };
  }
  const wantKind = direction === 'LONG' ? 'demandZone' : 'supplyZone';
  const pad = Math.max(atr * 1.8, tip * 0.004);
  let best: OverlayItem | null = null;
  let bestDist = Infinity;
  for (const o of overlays) {
    if (o.kind !== wantKind) continue;
    const p1 = Number(o.price1);
    const p2 = Number(o.price2);
    if (!(p1 > 0) || !(p2 > 0)) continue;
    const lo = Math.min(p1, p2);
    const hi = Math.max(p1, p2);
    const mid = (lo + hi) / 2;
    const dist = Math.abs(mid - tip);
    const overlaps = tip >= lo - pad && tip <= hi + pad;
    if (!overlaps && dist > pad) continue;
    if (dist < bestDist) {
      bestDist = dist;
      best = o;
    }
  }
  if (!best) {
    /** 존 없으면 피벗선만으로 통과(게이트 완화) · 방향은 캔들분석이 담당 */
    return { ok: true, mid: tip, label: '존없음·피벗선' };
  }
  const p1 = Number(best.price1);
  const p2 = Number(best.price2);
  return {
    ok: true,
    mid: (p1 + p2) / 2,
    label: direction === 'LONG' ? 'Demand합류' : 'Supply합류',
  };
}

export type BnbPplCandleSignal = {
  symbol: typeof BNB_PPL_SYMBOL;
  timeframe: string;
  direction: 'LONG' | 'SHORT';
  entry: number;
  sl: number;
  tp1: number;
  tipPrice: number;
  signalId: string;
  noteKo: string;
  slReasonKo: string;
  mode: 'enter_now' | 'wait_touch';
  closedBarTime: number;
  tp1RoePct: number;
  verdictKo: string;
  confirmKo: string;
};

export type BnbPplScanSkip = { tf: string; reasonKo: string };

/**
 * 마감봉 기준: 캔들분석 방향 + PPL 타점 터치(또는 대기).
 */
export function scanBnbPplCandleOnClosedBar(params: {
  candles: Candle[];
  timeframe: string;
  leverage?: number;
  minRr?: number;
  analysis?: AnalyzeResponse | null;
  /** 타점 미달 시 AIZONE 보던방향≥70 진입용 */
  longPct?: number | null;
  shortPct?: number | null;
}): BnbPplCandleSignal | BnbPplScanSkip {
  const candles = params.candles;
  const n = candles.length;
  const tf = normalizeChartTimeframe(params.timeframe);
  if (n < 64) return { tf, reasonKo: '캔들부족' };

  const iClosed = n - 2;
  const closed = candles[iClosed]!;
  const closedT = Number(closed.time) || 0;
  const closePx = Number(closed.close);
  const hi = Number(closed.high);
  const lo = Number(closed.low);
  if (!(closePx > 0) || !(closedT > 0)) return { tf, reasonKo: '마감봉무효' };

  const analysis = params.analysis ?? null;
  if (!analysis) return { tf, reasonKo: '캔들분석없음' };
  const verdict = String(analysis.verdict || '').toUpperCase();
  if (verdict !== 'LONG' && verdict !== 'SHORT') {
    return { tf, reasonKo: `캔들분석 WAIT · ${verdict || 'NONE'}` };
  }
  const direction = verdict as 'LONG' | 'SHORT';

  const confirm = computeCandleAnalysisConfirmation(candles, analysis);
  const axis = direction === 'LONG' ? confirm.bull : confirm.bear;
  /** 완전확정 아니어도 구조 점수≥1 또는 headline 정렬이면 통과 */
  const confirmOk =
    (direction === 'LONG' && confirm.headline === 'BULL_CONFIRM') ||
    (direction === 'SHORT' && confirm.headline === 'BEAR_CONFIRM') ||
    axis.score >= 1 ||
    axis.structure;
  if (!confirmOk) {
    return {
      tf,
      reasonKo: `구조게이트 · ${confirm.headlineKo || confirm.progressKo}`,
    };
  }

  const slice = candles.slice(0, iClosed + 1);
  const ppl = buildParallelPivotLines(slice);
  const tipLine = nearestParallelPivotTip(ppl, direction, closePx);
  if (!tipLine) {
    return {
      tf,
      reasonKo: direction === 'LONG' ? 'PL선없음' : 'PH선없음',
    };
  }

  const atr = atr14(slice);
  const tip = tipLine.tipPrice;
  const plTip = nearestParallelPivotTip(ppl, 'LONG', closePx)?.tipPrice ?? null;
  const phTip = nearestParallelPivotTip(ppl, 'SHORT', closePx)?.tipPrice ?? null;
  const pivSide = assertPivotSideForDirection({
    direction,
    mark: closePx,
    plTip,
    phTip,
    atr,
  });
  if (!pivSide.ok) {
    return { tf, reasonKo: pivSide.reasonKo };
  }
  const zone = zoneNearTip(
    analysis?.overlays as OverlayItem[] | undefined,
    direction,
    tip,
    atr
  );

  const touchPad = Math.max(atr * 0.35, tip * 0.00045);
  const wickTouch =
    direction === 'LONG'
      ? lo <= tip + touchPad && hi >= tip - touchPad
      : hi >= tip - touchPad && lo <= tip + touchPad;
  const closeTouch = markTouchesParallelPivot(closePx, tip, touchPad);

  /** 무효: 롱이 피벗선 한참 아래 종가 / 숏이 한참 위 종가 */
  const invalid =
    direction === 'LONG'
      ? closePx < tip - atr * 0.55
      : closePx > tip + atr * 0.55;
  if (invalid) {
    return { tf, reasonKo: `무효 · 피벗선이탈종가` };
  }

  const lev = Math.max(1, Math.min(125, Number(params.leverage) || 20));
  const tpRoe = BNB_PPL_TP1_ROE_PCT / 100;
  const buf = Math.max(atr * 0.22, tip * 0.0004);
  const sl =
    direction === 'LONG' ? tip - buf : tip + buf;
  const entryProbe = wickTouch || closeTouch ? closePx : tip;
  const tp1Probe = roeTargetPrice(entryProbe, direction, lev, tpRoe);
  const risk = Math.abs(entryProbe - sl);
  const reward = Math.abs(tp1Probe - entryProbe);
  const minRr = Math.max(0.8, Number(params.minRr) || 1.2);
  if (risk > 0 && reward / risk < minRr * 0.85) {
    return { tf, reasonKo: `RR부족 · ${(reward / risk).toFixed(2)}` };
  }

  let mode: 'enter_now' | 'wait_touch' =
    wickTouch || closeTouch ? 'enter_now' : 'wait_touch';

  /**
   * §27: 타점미달·존없음·피벗선만 → AIZONE 점수만으로 enter_now 금지.
   * longPct/shortPct는 API 호환용으로만 받음.
   */
  void params.longPct;
  void params.shortPct;

  const entryPx = mode === 'enter_now' ? closePx : tip;
  const tp1Live = roeTargetPrice(entryPx, direction, lev, tpRoe);

  const geo = assertDirectionSlTp({
    direction,
    entry: entryPx,
    sl,
    tp: tp1Live,
  });
  if (!geo.ok) {
    return { tf, reasonKo: geo.reasonKo };
  }

  const signalId = `bnb-ppl-${tf}-${direction}-${closedT}`;
  const noteKo =
    mode === 'enter_now'
      ? `BNB ${tf} ${direction === 'LONG' ? '롱' : '숏'} · 캔들+${direction === 'LONG' ? 'PL' : 'PH'}터치 · ${zone.label}`
      : `BNB ${tf} ${direction === 'LONG' ? '롱' : '숏'} · 타점대기(AI단독진입금지) · ${zone.label}`;

  return {
    symbol: BNB_PPL_SYMBOL,
    timeframe: tf,
    direction,
    entry: geo.entry,
    sl: geo.sl,
    tp1: geo.tp ?? tp1Live,
    tipPrice: tip,
    signalId,
    noteKo,
    slReasonKo: `PPL ${direction === 'LONG' ? 'PL' : 'PH'} 바깥+버퍼`,
    mode,
    closedBarTime: closedT,
    tp1RoePct: BNB_PPL_TP1_ROE_PCT,
    verdictKo: `캔들 ${direction}`,
    confirmKo: confirm.headlineKo,
  };
}

/** 형성봉 마크가 대기 타점 터치했는지 */
export function bnbPplMarkReadyToEnter(
  sig: Pick<BnbPplCandleSignal, 'direction' | 'tipPrice' | 'mode'>,
  mark: number,
  atrHint?: number
): boolean {
  if (!(mark > 0) || !(sig.tipPrice > 0)) return false;
  if (sig.mode === 'enter_now') return true;
  const pad = Math.max(atrHint || sig.tipPrice * 0.001, sig.tipPrice * 0.0004);
  return markTouchesParallelPivot(mark, sig.tipPrice, pad);
}

export type { ParallelPivotLine };
