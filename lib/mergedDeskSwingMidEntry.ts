/**
 * 통합·분석 — 스윙·중투 단일 진입 자리 (5~10배 레버).
 * HQ존 + 마스터 + CHoCH→OB + 되돌림 + E/SL/TP 를 한 박스로 합침.
 * 조건부 참고 — 승률·수익 보장·투자 권유 아님.
 */
import type { Candle, OverlayItem } from '@/types';
import type { UTCTimestamp } from 'lightweight-charts';
import { normalizeChartTimeframe } from '@/lib/constants';
import type { MasterFuturesDecision } from '@/lib/mergedDeskMasterFuturesDecision';
import type { HqEntryZonesPack, HqEntryZone } from '@/lib/mergedDeskHqEntryZones';
import type { ChochObPathPack } from '@/lib/mergedDeskChochObPath';
import type { SwingRetracePack } from '@/lib/mergedDeskSwingRetrace';
import type { UnifiedDeskTradePlan } from '@/lib/unifiedDeskTradePlan';
import type { AtlasPulsePriceLine } from '@/lib/monthDeskAtlasPulseDesk';
import type { TfCloseSettleRow, TfCloseSettleBoard } from '@/lib/tfCloseSettleAssessment';
import { evaluateSettleEntryGate } from '@/lib/tfCloseSettleAssessment';
import {
  findMergedDeskZoneFormationBarTime,
  mergedWorkCandles,
  snapMergedOverlayTimeToCandles,
} from '@/lib/mergedAnalysisOverlayTimes';
import { collectSwingPivots, buildCandleAnchoredSwingChannel } from '@/lib/mergedDeskCandleTrendline';
import { isMergedDeskSharedFeatureTf } from '@/lib/mergedDeskSharedTfFeatures';
import { mergedDeskShortTradeRailLabels } from '@/lib/mergedDeskChartOnlyUi';

export type SwingMidStance = 'ENTER_LONG' | 'ENTER_SHORT' | 'WAIT_PULLBACK' | 'WAIT';

export type SwingMidLeverageBand = {
  minX: number;
  maxX: number;
  suggestX: number;
  stopDistPct: number;
  riskPct: number;
  sizingKo: string;
};

export type SwingMidEntryPack = {
  active: boolean;
  stance: SwingMidStance;
  side: 'LONG' | 'SHORT' | 'WAIT';
  grade: 'A' | 'B' | 'C' | 'X';
  /** 신호 합류 (승률 아님) */
  confluence: number;
  headlineKo: string;
  whereKo: string;
  actionKo: string;
  waitForKo: string | null;
  entryLow: number;
  entryHigh: number;
  entryMid: number;
  stopLoss: number;
  tp1: number;
  tp2: number;
  tp3: number;
  rr: number;
  invalidationKo: string;
  leverage: SwingMidLeverageBand;
  reasonsKo: string[];
  overlays: OverlayItem[];
  /** 가격축 수평선 (TradingView식) */
  priceLines: AtlasPulsePriceLine[];
  summaryKo: string;
  /** 종가마감 게이트 요약 (ENTER 필터) */
  settleGateKo?: string;
  settleEnterAllowed?: boolean;
};

const LEV_MIN = 5;
const LEV_MAX = 10;
const ACCOUNT_DEFAULT = 3000;
const RISK_PCT = 1;

function fmt(p: number): string {
  if (!Number.isFinite(p) || p <= 0) return '—';
  if (p >= 1000) return p.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (p >= 1) return p.toFixed(1);
  return p.toFixed(3);
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function rrOf(side: 'LONG' | 'SHORT', entry: number, sl: number, tp: number): number {
  const risk = Math.abs(entry - sl);
  if (risk < 1e-9 || entry <= 0 || sl <= 0 || tp <= 0) return 0;
  if (side === 'LONG' && !(sl < entry && tp > entry)) return 0;
  if (side === 'SHORT' && !(sl > entry && tp < entry)) return 0;
  return Math.abs(tp - entry) / risk;
}

/** 스윙·중투: 손절폭에 맞춰 5~10배 권장 (과대 레버 금지) */
export function computeSwingMidLeverage(
  entry: number,
  stop: number,
  accountUsdt = ACCOUNT_DEFAULT,
  riskPct = RISK_PCT
): SwingMidLeverageBand {
  const stopDist = Math.abs(entry - stop);
  const stopDistPct = entry > 0 ? (stopDist / entry) * 100 : 0;
  // 손절폭이 클수록 레버↓ (중투 안정)
  let suggestX = 8;
  if (stopDistPct >= 2.5) suggestX = 5;
  else if (stopDistPct >= 1.8) suggestX = 6;
  else if (stopDistPct >= 1.2) suggestX = 7;
  else if (stopDistPct >= 0.8) suggestX = 8;
  else suggestX = 9;
  suggestX = clamp(suggestX, LEV_MIN, LEV_MAX);

  const riskUsdt = accountUsdt * (riskPct / 100);
  const qty = stopDist > 0 ? riskUsdt / stopDist : 0;
  const notional = qty * entry;
  const rawLev = accountUsdt > 0 && notional > 0 ? Math.ceil(notional / accountUsdt) : suggestX;
  suggestX = clamp(Math.max(suggestX, Math.min(rawLev, LEV_MAX)), LEV_MIN, LEV_MAX);

  return {
    minX: LEV_MIN,
    maxX: LEV_MAX,
    suggestX,
    stopDistPct,
    riskPct,
    sizingKo: `스윙·중투 레버 ${LEV_MIN}~${LEV_MAX}x (권장 ${suggestX}x) · 계좌≈${accountUsdt}USDT · 리스크 ${riskPct}% · 손절폭 ${stopDistPct.toFixed(2)}%`,
  };
}

function pickHqZone(hq: HqEntryZonesPack | null | undefined, side: 'LONG' | 'SHORT'): HqEntryZone | null {
  const list = side === 'LONG' ? hq?.longZones : hq?.shortZones;
  if (!list?.length) return null;
  return [...list].sort((a, b) => b.score - a.score)[0] ?? null;
}

function fibNearZone(
  retrace: SwingRetracePack | null | undefined,
  bot: number,
  top: number
): boolean {
  const leg = retrace?.active;
  if (!leg) return false;
  for (const lv of leg.levels) {
    if (lv.ratio < 0.38 || lv.ratio > 0.786) continue;
    if (lv.price >= bot * 0.995 && lv.price <= top * 1.005) return true;
  }
  return false;
}

/**
 * 스윙·중투 단일 진입 팩 — 차트에 ★스윙진입 1개만 강조.
 */
export function buildMergedDeskSwingMidEntryPack(params: {
  candles: Candle[];
  timeframe: string;
  masterFutures: MasterFuturesDecision | null;
  hqEntryZones: HqEntryZonesPack | null;
  chochObPath: ChochObPathPack | null;
  swingRetrace: SwingRetracePack | null;
  tradePlan: UnifiedDeskTradePlan | null;
  currentPrice?: number | null;
  accountUsdt?: number;
  /** 타이롱 종가 마감·안착 — SL/TP·합류 보강 */
  settleRow?: TfCloseSettleRow | null;
  /** 보드 있으면 상위 TF 동조·실패 하드컷 적용 */
  settleBoard?: TfCloseSettleBoard | null;
}): SwingMidEntryPack {
  const empty: SwingMidEntryPack = {
    active: false,
    stance: 'WAIT',
    side: 'WAIT',
    grade: 'X',
    confluence: 0,
    headlineKo: '스윙·중투 진입자리 대기',
    whereKo: '차트에서 ★스윙진입 존이 생기면 여기가 자리입니다',
    actionKo: '관망 — 합류·구조 확인 중',
    waitForKo: null,
    entryLow: 0,
    entryHigh: 0,
    entryMid: 0,
    stopLoss: 0,
    tp1: 0,
    tp2: 0,
    tp3: 0,
    rr: 0,
    invalidationKo: '',
    leverage: computeSwingMidLeverage(1, 0.99, params.accountUsdt ?? ACCOUNT_DEFAULT),
    reasonsKo: [],
    overlays: [],
    priceLines: [],
    summaryKo: '스윙 진입 — 대기',
    settleGateKo: undefined,
    settleEnterAllowed: undefined,
  };

  if (!isMergedDeskSharedFeatureTf(params.timeframe)) return empty;

  const tf = normalizeChartTimeframe(params.timeframe);
  const candles = mergedWorkCandles(params.candles, tf);

  if (candles.length < 20) return empty;

  const last = candles[candles.length - 1]!;
  const price =
    params.currentPrice && params.currentPrice > 0 ? params.currentPrice : last.close;
  const master = params.masterFutures;
  const plan = params.tradePlan;
  const choch = params.chochObPath;
  const hq = params.hqEntryZones;

  // 방향: 마스터 > 플랜 > CHoCH 경로
  let side: 'LONG' | 'SHORT' | 'WAIT' = 'WAIT';
  if (master?.side === 'LONG' || master?.side === 'SHORT') side = master.side;
  else if (plan?.direction === 'LONG' || plan?.direction === 'SHORT') side = plan.direction;
  else if (choch?.active && choch.side) side = choch.side;

  if (side === 'WAIT') {
    return {
      ...empty,
      headlineKo: '스윙·중투 — 지금은 관망',
      whereKo: '롱/숏 방향이 잠금됨 · 게이트·MTF·존 합류 대기',
      actionKo: master?.reasonKo || '방향 혼재 — 진입하지 않음',
      reasonsKo: master?.gateBlockReasons?.slice(0, 3) ?? ['마스터 관망'],
      summaryKo: '스윙 관망 — 진입자리 없음',
    };
  }

  const hqZone = pickHqZone(hq, side);
  const pullback = choch?.active ? choch.pullbackOb : null;
  const bounceTarget = choch?.active ? choch.bounceOb : null;

  // 진입 박스: HQ > CHoCH 눌림 OB > 플랜 엔트리 밴드
  let entryLow = 0;
  let entryHigh = 0;
  let entryMid = 0;
  const reasonsKo: string[] = [];

  if (hqZone) {
    entryLow = hqZone.bot;
    entryHigh = hqZone.top;
    entryMid = hqZone.mid;
    reasonsKo.push(`고확률 ${side === 'LONG' ? '롱' : '숏'}자리 ${hqZone.grade} · 신호${hqZone.score}`);
  } else if (pullback) {
    entryLow = pullback.low;
    entryHigh = pullback.high;
    entryMid = pullback.mid;
    reasonsKo.push(`CHoCH→OB 눌림 ${pullback.labelKo}`);
  } else if (plan && plan.entry > 0) {
    const band = Math.abs(plan.entry - (plan.stopLoss || plan.entry)) * 0.35;
    entryMid = plan.entry;
    entryLow = side === 'LONG' ? plan.entry - band : plan.entry;
    entryHigh = side === 'LONG' ? plan.entry : plan.entry + band;
    if (entryLow > entryHigh) [entryLow, entryHigh] = [entryHigh, entryLow];
    reasonsKo.push('통합 타점 E 밴드');
  } else if (master && master.entryPrice > 0) {
    const band = Math.abs(master.entryPrice - master.stopPrice) * 0.35 || master.entryPrice * 0.004;
    entryMid = master.entryPrice;
    entryLow = side === 'LONG' ? master.entryPrice - band : master.entryPrice;
    entryHigh = side === 'LONG' ? master.entryPrice : master.entryPrice + band;
    if (entryLow > entryHigh) [entryLow, entryHigh] = [entryHigh, entryLow];
    reasonsKo.push('마스터 E');
  }

  if (!(entryMid > 0) || !(entryHigh > entryLow)) {
    return {
      ...empty,
      side,
      headlineKo: `스윙 ${side === 'LONG' ? '롱' : '숏'} 방향만 있음 — 진입존 미형성`,
      whereKo: '지지/되돌림 존이 잡히면 ★스윙진입이 표시됩니다',
      actionKo: '관망 — 존·OB 합류 대기',
      waitForKo:
        side === 'LONG'
          ? '하락 후 수요·되돌림 존 터치 대기'
          : '상승 후 공급·되돌림 존 터치 대기',
      reasonsKo: ['진입 박스 미확정'],
      summaryKo: `스윙 ${side} 대기 — 존 없음`,
    };
  }

  // SL / TP
  let stopLoss =
    master?.stopPrice && master.stopPrice > 0
      ? master.stopPrice
      : plan?.stopLoss && plan.stopLoss > 0
        ? plan.stopLoss
        : side === 'LONG'
          ? entryLow * 0.992
          : entryHigh * 1.008;

  if (side === 'LONG' && stopLoss >= entryLow) stopLoss = entryLow * 0.994;
  if (side === 'SHORT' && stopLoss <= entryHigh) stopLoss = entryHigh * 1.006;

  let tp1 =
    plan?.tp1 && plan.tp1 > 0
      ? plan.tp1
      : bounceTarget?.mid &&
          ((side === 'LONG' && bounceTarget.mid > entryMid) ||
            (side === 'SHORT' && bounceTarget.mid < entryMid))
        ? bounceTarget.mid
        : 0;

  /** 종가 마감 보드 — 전저/전고로 SL·TP1 스냅 (구조 유지 범위 안) */
  const settle = params.settleRow;
  if (settle) {
    const priorHi = Number(settle.priorHigh);
    const priorLo = Number(settle.priorLow);
    const priorCl = Number(settle.priorClose);
    if (side === 'LONG') {
      if (Number.isFinite(priorLo) && priorLo > 0 && priorLo < entryMid) {
        const cand = priorLo * 0.997;
        if (cand < entryLow && cand > entryMid * 0.965) {
          stopLoss = Math.min(stopLoss, cand);
          reasonsKo.push('종가TF 전저 아래 SL');
        }
      }
      if (Number.isFinite(priorHi) && priorHi > entryMid) {
        const candTp = priorHi;
        if (candTp > entryMid + Math.abs(entryMid - stopLoss) * 0.8) {
          tp1 = candTp;
          reasonsKo.push('종가TF 전고 TP1');
        }
      } else if (Number.isFinite(priorCl) && priorCl > entryMid) {
        tp1 = Math.max(tp1 || 0, priorCl);
      }
      if (
        (settle.tailongTag === '종가안착' || settle.formingVerdict === '안착') &&
        (settle.vsPriorClose === '위' || settle.confirmedEdge === '롱 유리')
      ) {
        reasonsKo.push('종가안착·롱 우호');
      }
      if (settle.tailongTag === '꼬리실패' || settle.formingVerdict === '실패') {
        reasonsKo.push('종가실패 주의 — 진입 보수');
      }
    } else {
      if (Number.isFinite(priorHi) && priorHi > entryMid) {
        const cand = priorHi * 1.003;
        if (cand > entryHigh && cand < entryMid * 1.035) {
          stopLoss = Math.max(stopLoss, cand);
          reasonsKo.push('종가TF 전고 위 SL');
        }
      }
      if (Number.isFinite(priorLo) && priorLo < entryMid) {
        const candTp = priorLo;
        if (candTp < entryMid - Math.abs(entryMid - stopLoss) * 0.8) {
          tp1 = candTp;
          reasonsKo.push('종가TF 전저 TP1');
        }
      } else if (Number.isFinite(priorCl) && priorCl < entryMid) {
        tp1 = tp1 > 0 ? Math.min(tp1, priorCl) : priorCl;
      }
      if (
        (settle.tailongTag === '종가안착' || settle.formingVerdict === '안착') &&
        (settle.vsPriorClose === '아래' || settle.confirmedEdge === '숏 유리')
      ) {
        reasonsKo.push('종가안착·숏 우호');
      }
      if (settle.tailongTag === '꼬리실패' || settle.formingVerdict === '실패') {
        reasonsKo.push('종가실패 주의 — 진입 보수');
      }
    }
  }

  let risk = Math.abs(entryMid - stopLoss);
  const sign = side === 'LONG' ? 1 : -1;
  if (!(tp1 > 0) || (side === 'LONG' ? tp1 <= entryMid : tp1 >= entryMid)) {
    tp1 = entryMid + sign * risk * 1.5;
  }
  let tp2 = plan?.tp2 && plan.tp2 > 0 ? plan.tp2 : entryMid + sign * risk * 2.5;
  let tp3 = plan?.tp3 && plan.tp3 > 0 ? plan.tp3 : entryMid + sign * risk * 4.0;

  if (side === 'LONG') {
    if (tp1 <= entryMid) tp1 = entryMid + risk * 1.5;
    if (tp2 <= tp1) tp2 = entryMid + risk * 2.5;
    if (tp3 <= tp2) tp3 = entryMid + risk * 4.0;
  } else {
    if (tp1 >= entryMid) tp1 = entryMid - risk * 1.5;
    if (tp2 >= tp1) tp2 = entryMid - risk * 2.5;
    if (tp3 >= tp2) tp3 = entryMid - risk * 4.0;
  }

  risk = Math.abs(entryMid - stopLoss);
  const rr = rrOf(side, entryMid, stopLoss, tp1);
  const fibHit = fibNearZone(params.swingRetrace, entryLow, entryHigh);
  if (fibHit) reasonsKo.push('되돌림 Fib 합류');
  if (choch?.active && choch.side === side) reasonsKo.push(`CHoCH→OB ${choch.phaseKo}`);
  if (master?.entryAllowed) reasonsKo.push(`마스터 ${master.grade} 진입가능`);
  else if (master && !master.entryAllowed) reasonsKo.push(`마스터 잠금: ${master.gateBlockReasons[0] ?? '조건미달'}`);

  let confluence = 48;
  if (hqZone) confluence += hqZone.grade === 'A' ? 18 : 12;
  if (fibHit) confluence += 8;
  if (choch?.active && choch.side === side) confluence += 10;
  if (master?.entryAllowed) confluence += master.grade === 'A' ? 14 : 8;
  if (rr >= 2) confluence += 6;
  else if (rr >= 1.5) confluence += 3;

  const settleGate = evaluateSettleEntryGate({
    side,
    chartTf: tf,
    settleBoard: params.settleBoard,
    settleRow: settle ?? null,
  });
  confluence += settleGate.confluenceDelta;
  if (settleGate.boostReasons.length) reasonsKo.push(...settleGate.boostReasons.slice(0, 2));
  if (settleGate.hardBlockReasons.length) reasonsKo.push(...settleGate.hardBlockReasons.slice(0, 2));

  if (master && !master.entryAllowed) confluence -= 12;
  confluence = clamp(Math.round(confluence), 0, 96);

  const inside = price >= entryLow && price <= entryHigh;
  const distPct = (Math.abs(price - entryMid) / price) * 100;

  /** ENTER 합류 바닥 — 종가보드 있으면 더 엄격 */
  const enterFloor = settle || params.settleBoard?.rows?.length ? 62 : 58;
  const pullFloor = settle || params.settleBoard?.rows?.length ? 58 : 55;

  let stance: SwingMidStance = 'WAIT';
  if (master && !master.entryAllowed && confluence < 62) {
    stance = 'WAIT';
  } else if (
    inside &&
    confluence >= enterFloor &&
    (master?.entryAllowed !== false || confluence >= 72) &&
    settleGate.allowEnter
  ) {
    stance = side === 'LONG' ? 'ENTER_LONG' : 'ENTER_SHORT';
  } else if (!inside && confluence >= pullFloor && settleGate.allowPullbackWait) {
    stance = 'WAIT_PULLBACK';
  } else if (inside && confluence >= pullFloor && settleGate.allowPullbackWait && !settleGate.allowEnter) {
    stance = 'WAIT_PULLBACK';
  } else {
    stance = 'WAIT';
  }

  // 마스터 잠금이면 강제 관망(합류 매우 높을 때만 예외적으로 WAIT_PULLBACK 유지)
  if (master && !master.entryAllowed && stance.startsWith('ENTER')) {
    stance = inside ? 'WAIT' : 'WAIT_PULLBACK';
  }

  // 종가 실패·역방향·상위 미동조 → ENTER 강제 해제
  if (stance.startsWith('ENTER') && !settleGate.allowEnter) {
    stance = settleGate.allowPullbackWait
      ? 'WAIT_PULLBACK'
      : 'WAIT';
    if (!reasonsKo.some((r) => r.includes('종가'))) {
      reasonsKo.push(settleGate.hardBlockReasons[0] ?? '종가게이트 HOLD');
    }
  }

  const grade: SwingMidEntryPack['grade'] =
    confluence >= 80 && stance.startsWith('ENTER') && settleGate.allowEnter
      ? 'A'
      : confluence >= 66 && settleGate.sealedOk
        ? 'B'
        : confluence >= 52
          ? 'C'
          : 'X';

  const leverage = computeSwingMidLeverage(
    entryMid,
    stopLoss,
    params.accountUsdt ?? ACCOUNT_DEFAULT,
    RISK_PCT
  );

  const invalidationKo =
    side === 'LONG'
      ? `무효: 종가 ${fmt(stopLoss)} 이탈 · 또는 진입존 ${fmt(entryLow)} 붕괴`
      : `무효: 종가 ${fmt(stopLoss)} 돌파 · 또는 진입존 ${fmt(entryHigh)} 붕괴`;

  const headlineKo =
    stance === 'ENTER_LONG'
      ? `★ 스윙 롱 진입자리 · ${grade}`
      : stance === 'ENTER_SHORT'
        ? `★ 스윙 숏 진입자리 · ${grade}`
        : stance === 'WAIT_PULLBACK'
          ? `스윙 ${side === 'LONG' ? '롱' : '숏'} — 존까지 대기`
          : `스윙 관망 · ${grade}`;

  const whereKo = `진입존 ${fmt(entryLow)} ~ ${fmt(entryHigh)}${inside ? ' ← 지금 터치중' : ` · 현재가 ${fmt(price)} (거리 ${distPct.toFixed(2)}%)`}`;

  const actionKo =
    stance === 'ENTER_LONG' || stance === 'ENTER_SHORT'
      ? `여기서 진입 검토 · 레버 ${leverage.suggestX}x(5~10) · SL ${fmt(stopLoss)} · TP1 ${fmt(tp1)} · RR≈${rr.toFixed(2)} · ${settleGate.summaryKo}`
      : stance === 'WAIT_PULLBACK'
        ? settleGate.allowEnter
          ? `가격이 ${fmt(entryLow)}~${fmt(entryHigh)}에 닿을 때 진입 · 지금은 추격 금지`
          : `종가게이트 HOLD — ${settleGate.hardBlockReasons[0] ?? '마감·상위 동조 대기'} · 존 터치만 감시`
        : `진입 보류 — ${settleGate.hardBlockReasons[0] ?? reasonsKo[0] ?? '합류 부족'}`;

  const waitForKo =
    stance === 'WAIT_PULLBACK'
      ? !settleGate.allowEnter
        ? settleGate.hardBlockReasons[0] ?? '종가 마감·상위 TF 동조 후 ENTER'
        : side === 'LONG'
          ? `하락 후 ${fmt(entryMid)} 부근 터치 대기`
          : `반등 후 ${fmt(entryMid)} 부근 터치 대기`
      : stance === 'WAIT'
        ? settleGate.failAgainst
          ? '종가 실패/역방향 — 시나리오 재검토'
          : '게이트·합류 개선 대기'
        : null;

  const tEnd = Number(snapMergedOverlayTimeToCandles(Number(last.time), candles));
  const tStart = Number(
    snapMergedOverlayTimeToCandles(
      findMergedDeskZoneFormationBarTime(candles, entryHigh, entryLow, null),
      candles
    )
  );
  const isLong = side === 'LONG';
  const pulse = stance.startsWith('ENTER') || inside;
  const sideTag = isLong ? '▲롱' : '▼숏';
  const shortRail = mergedDeskShortTradeRailLabels();
  const goStance = stance.startsWith('ENTER');

  const overlays: OverlayItem[] = [
    {
      id: `merged-swing-mid-entry-zone`,
      kind: isLong ? 'demandZone' : 'supplyZone',
      /** 짧은 캡션만 — E/SL/TP 글자는 priceLines(전폭 선·축)로 */
      label: goStance ? '★진입' : '대기',
      labelTooltip: `${headlineKo} · ${whereKo} · ${actionKo} · ${invalidationKo} · ${leverage.sizingKo}`,
      x1: 0,
      y1: 0,
      x2: 1,
      y2: 0,
      time1: tStart as UTCTimestamp,
      time2: tEnd as UTCTimestamp,
      price1: entryHigh,
      price2: entryLow,
      confidence: confluence,
      color: isLong
        ? goStance
          ? 'rgba(34,211,238,0.34)'
          : 'rgba(34,211,238,0.12)'
        : goStance
          ? 'rgba(248,113,113,0.32)'
          : 'rgba(248,113,113,0.1)',
      category: 'scenario',
      zonePulse: pulse,
      zoneFillPreserve: true,
      lineLabelColor: isLong ? '#a5f3fc' : '#fecaca',
      labelBackgroundColor: isLong ? 'rgba(8,47,73,0.96)' : 'rgba(127,29,29,0.96)',
      labelTextColor: '#fff',
      overlayZoneExtraClass: [
        'merged-swing-mid-entry',
        goStance ? 'merged-swing-mid-entry--go' : 'merged-swing-mid-entry--wait',
        isLong ? 'merged-swing-mid-long' : 'merged-swing-mid-short',
        goStance ? '' : 'merged-swing-mid-entry--dim',
      ]
        .filter(Boolean)
        .join(' '),
    },
  ];

  /** E/SL/TP HTML 짧은 레일 금지 — priceLines(LineSeries+축)만 사용 */

  // 피벗 → 진입존 추세선 (TV 스타일)
  const pivots = collectSwingPivots(candles, tf);
  if (isLong && pivots.lows.length >= 1) {
    const p = pivots.lows[pivots.lows.length - 1]!;
    overlays.push({
      id: 'merged-swing-mid-trend-to-entry',
      kind: 'trendLine',
      label: '',
      x1: 0,
      y1: 0,
      x2: 1,
      y2: 1,
      time1: p.time as UTCTimestamp,
      price1: p.price,
      time2: tEnd as UTCTimestamp,
      price2: entryMid,
      confidence: 80,
      color: 'rgba(34,211,238,0.85)',
      lineStrokeWidth: 2,
      lineDash: '5 4',
      category: 'chartPrimeTrendChannels',
      noProject: true,
      overlayZoneExtraClass: 'merged-swing-mid-trend',
      labelTooltip: '스윙 저점 → 진입 E',
    });
  } else if (!isLong && pivots.highs.length >= 1) {
    const p = pivots.highs[pivots.highs.length - 1]!;
    overlays.push({
      id: 'merged-swing-mid-trend-to-entry',
      kind: 'trendLine',
      label: '',
      x1: 0,
      y1: 0,
      x2: 1,
      y2: 1,
      time1: p.time as UTCTimestamp,
      price1: p.price,
      time2: tEnd as UTCTimestamp,
      price2: entryMid,
      confidence: 80,
      color: 'rgba(248,113,113,0.85)',
      lineStrokeWidth: 2,
      lineDash: '5 4',
      category: 'chartPrimeTrendChannels',
      noProject: true,
      overlayZoneExtraClass: 'merged-swing-mid-trend',
      labelTooltip: '스윙 고점 → 진입 E',
    });
  }

  const channel = buildCandleAnchoredSwingChannel(candles, tf);
  if (channel.length) {
    overlays.push(
      ...channel.map((o) => ({
        ...o,
        id: `merged-swing-mid-${String(o.id || 'ch')}`,
        overlayZoneExtraClass: [String(o.overlayZoneExtraClass || ''), 'merged-swing-mid-channel']
          .filter(Boolean)
          .join(' '),
      }))
    );
  }

  const priceLines: AtlasPulsePriceLine[] = [
    {
      price: entryMid,
      color: '#FACC15',
      title: shortRail ? `${sideTag}진입E` : `${sideTag}진입E ${fmt(entryMid)}`,
      lineWidth: goStance ? 2 : 1,
      lineStyle: 'solid',
    },
    {
      price: stopLoss,
      color: '#F87171',
      title: shortRail ? `${sideTag}손절SL` : `${sideTag}손절SL ${fmt(stopLoss)}`,
      lineWidth: goStance ? 2 : 1,
      lineStyle: 'dashed',
    },
    {
      price: tp1,
      color: '#86EFAC',
      title: shortRail
        ? `${sideTag}익절TP1`
        : `${sideTag}익절TP1 ${fmt(tp1)}${rr > 0 ? ` · ${rr.toFixed(1)}R` : ''}`,
      lineWidth: goStance ? 2 : 1,
      lineStyle: 'dotted',
    },
  ];
  if (goStance) {
    priceLines.push(
      {
        price: tp2,
        color: '#7DD3FC',
        title: shortRail ? `${sideTag}익절TP2` : `${sideTag}익절TP2 ${fmt(tp2)}`,
        lineWidth: 1,
        lineStyle: 'dotted',
      },
      {
        price: tp3,
        color: '#A78BFA',
        title: shortRail ? `${sideTag}익절TP3` : `${sideTag}익절TP3 ${fmt(tp3)}`,
        lineWidth: 1,
        lineStyle: 'dotted',
      }
    );
  }

  return {
    active: true,
    stance,
    side,
    grade,
    confluence,
    headlineKo,
    whereKo,
    actionKo,
    waitForKo,
    entryLow,
    entryHigh,
    entryMid,
    stopLoss,
    tp1,
    tp2,
    tp3,
    rr,
    invalidationKo,
    leverage,
    reasonsKo: reasonsKo.slice(0, 6),
    overlays,
    priceLines,
    summaryKo: `${headlineKo} · ${fmt(entryLow)}~${fmt(entryHigh)} · ${leverage.suggestX}x · ${settleGate.summaryKo}`,
    settleGateKo: settleGate.summaryKo,
    settleEnterAllowed: settleGate.allowEnter,
  };
}

export function summarizeSwingMidEntryKo(pack: SwingMidEntryPack): string {
  if (!pack.active && pack.side === 'WAIT') return pack.summaryKo;
  return pack.summaryKo;
}

/** HQ 오버레이: 스윙 방향과 반대 쪽은 숨겨 차트 혼잡 완화 */
export function filterHqOverlaysForSwingSide(
  overlays: OverlayItem[],
  side: 'LONG' | 'SHORT' | 'WAIT'
): OverlayItem[] {
  if (side === 'WAIT') return overlays;
  return overlays.filter((o) => {
    const id = String(o.id || '');
    if (!id.includes('hq-') && !id.includes('hotzone-')) return true;
    if (side === 'LONG' && (id.includes('hq-short') || id.includes('hotzone-short'))) return false;
    if (side === 'SHORT' && (id.includes('hq-long') || id.includes('hotzone-long'))) return false;
    return true;
  });
}
