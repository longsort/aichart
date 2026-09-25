/**
 * SNIPER_SCALP_AUTO_ENGINE — BTC 독립 신호 모듈.
 * 기존 CONFIRMED/밴드 판정에 연결하지 않음. 데이터(봉·구조이벤트·유동성)만 재사용.
 * 확정 수익·고정 승률 아님. 미마감봉 확정 금지.
 */
import { atrAt, type Eagle1Bar, type StructureSnapshot } from '@/lib/eagle1/structureEngine';
import { clampSelectedRiskPct, governIdeaRisk } from '@/lib/eagle1Tapoint/aiAutopilotRiskGovernor';

export const SNIPER_SCALP_ENGINE_ID = 'SNIPER_SCALP_AUTO_ENGINE' as const;
export const SNIPER_DEFAULT_TP_PCT = 0.5;
export const SNIPER_CHASE_ATR = 0.55;
export const SNIPER_RISK_PCT_DEFAULT = 0.5;
export const SNIPER_MAX_LEV = 20;

export type SniperSetupId = 'S1' | 'S2' | 'S3' | 'S4' | 'S5';
export type SniperThesis = 'LONG_ALLOWED' | 'SHORT_ALLOWED' | 'BOTH_ALLOWED' | 'NO_TRADE';
export type SniperMacro = 'LONG_FAVORABLE' | 'SHORT_FAVORABLE' | 'NEUTRAL';
export type SniperGrade = 'ULTRA' | 'A+' | 'A' | 'WATCH' | 'WAIT';
export type SniperMachine =
  | 'IDLE'
  | 'CONTEXT_READY'
  | 'BATTLE_ZONE_ACTIVE'
  | 'SETUP_DETECTED'
  | 'SETUP_READY'
  | 'RETEST_TOUCH'
  | 'RETEST_HOLD'
  | 'OPPOSITE_FAILURE'
  | 'MICRO_TRIGGER'
  | 'ENTRY_WINDOW'
  | 'FIRE'
  | 'MISSED'
  | 'WAIT';

export type SniperWaitReason =
  | 'NOT_ALLOWED'
  | 'NOT_BTC'
  | 'DATA_BAD'
  | 'NO_TRADE_ZONE'
  | 'RANGE_CENTER'
  | 'NO_SETUP'
  | 'SETUP_ONLY'
  | 'NO_RETEST_HOLD'
  | 'NO_OPPOSITE_FAILURE'
  | 'NO_MICRO_TRIGGER'
  | 'CHASE'
  | 'RR_LOW'
  | 'VOLATILITY_EXTREME'
  | 'EXPIRED'
  | 'OK';

export type SniperScalpResult = {
  engine: typeof SNIPER_SCALP_ENGINE_ID;
  ok: boolean;
  autoReady: boolean;
  fire: boolean;
  direction: 'LONG' | 'SHORT' | null;
  setupId: SniperSetupId | null;
  setupKo: string;
  macro: SniperMacro;
  thesis: SniperThesis;
  battleZone: 'PRIMARY' | 'EDGE' | 'CENTER' | 'NONE';
  entry: number | null;
  executionSl: number | null;
  thesisInvalidation: number | null;
  tp: number | null;
  tpPct: number;
  slPct: number;
  netRr: number | null;
  sniperScore: number;
  oppositeFailure: number;
  leverage: number | null;
  riskR: number;
  positionNotional: number | null;
  grade: SniperGrade;
  machineState: SniperMachine;
  waitReason: SniperWaitReason;
  eventId: string | null;
  setupIdKey: string | null;
  sampleN: number;
  sampleLabel: 'INSUFFICIENT';
  tpFirstProbability: number | null;
  fastGreen3m: number | null;
  expectedMae: number | null;
  reasonKo: string;
  whyKo: string;
};

function clip(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Math.round(n)));
}

function closedIdx(n: number): number {
  return Math.max(0, n - 2);
}

function lastEv(st: StructureSnapshot | null | undefined, kinds: string[], asOf: number) {
  const want = new Set(kinds.map((k) => k.toUpperCase()));
  return [...(st?.events || [])]
    .reverse()
    .find((e) => {
      if (!want.has(String(e.kind || '').toUpperCase())) return false;
      const i = Number.isFinite(Number(e.known_at)) ? Number(e.known_at) : Number(e.index);
      return i <= asOf;
    });
}

function biasOf(st: StructureSnapshot | null | undefined): 'bullish' | 'bearish' | null {
  const ev = [...(st?.events || [])].reverse().find((e) => e.kind === 'CHOCH' || e.kind === 'BOS');
  if (ev?.bias === 'bullish') return 'bullish';
  if (ev?.bias === 'bearish') return 'bearish';
  return null;
}

function empty(
  reasonKo: string,
  wait: SniperWaitReason,
  extra?: Partial<SniperScalpResult>
): SniperScalpResult {
  return {
    engine: SNIPER_SCALP_ENGINE_ID,
    ok: false,
    autoReady: false,
    fire: false,
    direction: extra?.direction ?? null,
    setupId: extra?.setupId ?? null,
    setupKo: extra?.setupKo ?? '',
    macro: extra?.macro ?? 'NEUTRAL',
    thesis: extra?.thesis ?? 'BOTH_ALLOWED',
    battleZone: extra?.battleZone ?? 'NONE',
    entry: extra?.entry ?? null,
    executionSl: extra?.executionSl ?? null,
    thesisInvalidation: extra?.thesisInvalidation ?? null,
    tp: extra?.tp ?? null,
    tpPct: SNIPER_DEFAULT_TP_PCT,
    slPct: 0,
    netRr: extra?.netRr ?? null,
    sniperScore: extra?.sniperScore ?? 0,
    oppositeFailure: extra?.oppositeFailure ?? 0,
    leverage: extra?.leverage ?? null,
    riskR: extra?.riskR ?? 1,
    positionNotional: extra?.positionNotional ?? null,
    grade: 'WAIT',
    machineState: extra?.machineState ?? 'WAIT',
    waitReason: wait,
    eventId: extra?.eventId ?? null,
    setupIdKey: extra?.setupIdKey ?? null,
    sampleN: 0,
    sampleLabel: 'INSUFFICIENT',
    tpFirstProbability: null,
    fastGreen3m: null,
    expectedMae: null,
    reasonKo,
    whyKo: extra?.whyKo ?? reasonKo,
  };
}

export function sniperRiskSize(input: {
  entry: number;
  sl: number;
  equityUsdt?: number;
  riskPct?: number;
  maxLev?: number;
}): { leverage: number; notional: number; riskAmount: number } {
  const entry = input.entry;
  const slDist = Math.abs(entry - input.sl) / Math.max(entry, 1e-9);
  const equity = Math.max(50, Number(input.equityUsdt) || 1000);
  const riskPct = Math.max(0.1, clampSelectedRiskPct(Number(input.riskPct) || SNIPER_RISK_PCT_DEFAULT));
  const riskAmount = equity * (riskPct / 100);
  const costBuf = slDist * 1.08;
  const notional = costBuf > 0 ? riskAmount / costBuf : 0;
  const maxLev = Math.max(2, Math.min(125, Number(input.maxLev) || SNIPER_MAX_LEV));
  const rawLev = equity > 0 ? notional / equity : 1;
  const leverage = Math.max(2, Math.min(maxLev, Math.floor(rawLev || 2)));
  return { leverage, notional: leverage * equity, riskAmount };
}

export function evaluateSniperScalpAutoEngine(params: {
  symbol: string;
  timeframe: string;
  candles: Eagle1Bar[];
  structure: StructureSnapshot | null | undefined;
  structures?: Partial<Record<string, StructureSnapshot | null>>;
  liqBelow?: number | null;
  liqAbove?: number | null;
  qualityOk: boolean;
  htfBias?: 'bullish' | 'bearish' | 'neutral' | null;
  candles1m?: Eagle1Bar[] | null;
  maxLev?: number;
  equityUsdt?: number;
  riskPct?: number;
}): SniperScalpResult {
  const symbol = String(params.symbol || '').toUpperCase();
  if (!symbol.startsWith('BTC') && !symbol.startsWith('ETH')) {
    return empty('BTC·ETH 오토파일럿 전용', 'NOT_ALLOWED');
  }
  const bars = params.candles || [];
  const n = bars.length;
  if (!params.qualityOk || n < 48) return empty('데이터품질불량', 'DATA_BAD');

  const asOf = closedIdx(n);
  const bar = bars[asOf];
  if (!bar) return empty('마감봉 없음', 'DATA_BAD');
  const entry = Number(bar.close);
  if (!(entry > 0)) return empty('가격 무효', 'DATA_BAD');

  const atr = atrAt(bars, asOf + 1, 14) || entry * 0.0025;
  const hi = Number(bar.high);
  const lo = Number(bar.low);
  const cl = Number(bar.close);
  const op = Number(bar.open);
  const range = Math.max(hi - lo, entry * 1e-8);
  const body = Math.abs(cl - op);
  const bodyRatio = body / range;

  const win = bars.slice(Math.max(0, asOf - 39), asOf + 1);
  const rh = Math.max(...win.map((b) => Number(b.high)));
  const rl = Math.min(...win.map((b) => Number(b.low)));
  const loc = (entry - rl) / Math.max(rh - rl, 1e-9);
  const atrMean =
    atrAt(bars, Math.max(16, asOf - 40) + 1, 14) || atr;
  if (atr > atrMean * 2.2) {
    return empty('변동성 극단 · AUTO OFF', 'VOLATILITY_EXTREME');
  }

  const d1 = biasOf(params.structures?.['1D'] || params.structures?.['1H']);
  const h4 = biasOf(params.structures?.['4H']);
  const h1 = biasOf(params.structures?.['1H']);
  const macro: SniperMacro =
    d1 === 'bullish' ? 'LONG_FAVORABLE' : d1 === 'bearish' ? 'SHORT_FAVORABLE' : 'NEUTRAL';
  let thesis: SniperThesis = 'BOTH_ALLOWED';
  if (h1 === 'bullish' && h4 !== 'bearish') thesis = 'LONG_ALLOWED';
  else if (h1 === 'bearish' && h4 !== 'bullish') thesis = 'SHORT_ALLOWED';
  else if (h1 && h4 && h1 !== h4) thesis = 'BOTH_ALLOWED';

  const h1st = params.structures?.['1H'] || null;
  const thesisInv =
    h1 === 'bullish'
      ? Number(h1st?.lastSwingLow?.price) || null
      : h1 === 'bearish'
        ? Number(h1st?.lastSwingHigh?.price) || null
        : null;

  const edge = loc <= 0.28 || loc >= 0.72;
  const center = loc > 0.42 && loc < 0.58;
  const battleZone: SniperScalpResult['battleZone'] = center ? 'CENTER' : edge ? 'PRIMARY' : 'EDGE';
  if (center) {
    return empty('레인지 중앙 · 가장자리만', 'RANGE_CENTER', {
      macro,
      thesis,
      battleZone,
      machineState: 'CONTEXT_READY',
    });
  }

  const st = params.structure || null;
  const sweep = lastEv(st, ['SWEEP', 'FAILED_BREAK'], asOf);
  const shift = lastEv(st, ['CHOCH', 'BOS'], asOf);
  const failed = lastEv(st, ['FAILED_BREAK'], asOf);
  const sellLiq = Number(params.liqBelow) > 0 ? Number(params.liqBelow) : Number(st?.lastSwingLow?.price) || null;
  const buyLiq = Number(params.liqAbove) > 0 ? Number(params.liqAbove) : Number(st?.lastSwingHigh?.price) || null;

  const sweepI = sweep
    ? Number.isFinite(Number(sweep.known_at))
      ? Number(sweep.known_at)
      : Number(sweep.index)
    : -1;
  const shiftI = shift
    ? Number.isFinite(Number(shift.known_at))
      ? Number(shift.known_at)
      : Number(shift.index)
    : -1;
  const sweepAge = sweepI >= 0 ? asOf - sweepI : 99;
  const shiftAge = shiftI >= 0 ? asOf - shiftI : 99;

  const longSweep =
    (sweep && sweepAge <= 8 && (sweep.bias === 'bullish' || String(sweep.kind).toUpperCase() === 'FAILED_BREAK')) ||
    (sellLiq != null && lo < sellLiq && cl > sellLiq && sellLiq - lo >= atr * 0.08);
  const shortSweep =
    (sweep && sweepAge <= 8 && sweep.bias === 'bearish') ||
    (buyLiq != null && hi > buyLiq && cl < buyLiq && hi - buyLiq >= atr * 0.08);
  const longReclaim = longSweep && ((sellLiq != null && cl > sellLiq) || (sweep && cl > Number(sweep.level || sweep.price || 0)));
  const shortReclaim = shortSweep && ((buyLiq != null && cl < buyLiq) || (sweep && cl < Number(sweep.level || sweep.price || cl + 1)));
  const longShift =
    shift && shiftAge <= 5 && shift.bias === 'bullish' && bodyRatio >= 0.38;
  const shortShift =
    shift && shiftAge <= 5 && shift.bias === 'bearish' && bodyRatio >= 0.38;

  const prev = bars[asOf - 1];
  const prev2 = bars[asOf - 2];
  const rngPrev = prev ? Math.max(Number(prev.high) - Number(prev.low), 1e-8) : range;
  const acceptUp = prev && cl > Number(prev.high) && bodyRatio >= 0.4;
  const acceptDn = prev && cl < Number(prev.low) && bodyRatio >= 0.4;
  const compress =
    range < atr * 0.85 && rngPrev < atr * 0.9 && prev2 && Number(prev2.high) - Number(prev2.low) < atr;

  const vol = Number(bar.volume) || 0;
  const volPrev = Number(prev?.volume) || vol;
  const downProg = prev ? Number(prev.low) - lo : 0;
  const upProg = prev ? hi - Number(prev.high) : 0;
  const absorbLong = vol > volPrev * 1.15 && downProg <= atr * 0.12 && cl >= op;
  const absorbShort = vol > volPrev * 1.15 && upProg <= atr * 0.12 && cl <= op;

  const pullbackLong =
    (params.htfBias === 'bullish' || thesis === 'LONG_ALLOWED') &&
    cl < op &&
    bodyRatio < 0.55 &&
    loc <= 0.45;
  const pullbackShort =
    (params.htfBias === 'bearish' || thesis === 'SHORT_ALLOWED') &&
    cl > op &&
    bodyRatio < 0.55 &&
    loc >= 0.55;

  type Cand = { id: SniperSetupId; dir: 'LONG' | 'SHORT'; ko: string };
  const cands: Cand[] = [];
  if (longReclaim && longShift) cands.push({ id: 'S1', dir: 'LONG', ko: 'S1 유동성반전' });
  if (shortReclaim && shortShift) cands.push({ id: 'S1', dir: 'SHORT', ko: 'S1 유동성반전' });
  if (compress && acceptUp) cands.push({ id: 'S2', dir: 'LONG', ko: 'S2 돌파재테스트' });
  if (compress && acceptDn) cands.push({ id: 'S2', dir: 'SHORT', ko: 'S2 돌파재테스트' });
  if (pullbackLong && longShift) cands.push({ id: 'S3', dir: 'LONG', ko: 'S3 추세되돌림' });
  if (pullbackShort && shortShift) cands.push({ id: 'S3', dir: 'SHORT', ko: 'S3 추세되돌림' });
  if (failed && failed.bias === 'bearish' && shortShift) cands.push({ id: 'S4', dir: 'SHORT', ko: 'S4 실패돌파' });
  if (failed && failed.bias === 'bullish' && longShift) cands.push({ id: 'S4', dir: 'LONG', ko: 'S4 실패돌파' });
  if (absorbLong && longReclaim) cands.push({ id: 'S5', dir: 'LONG', ko: 'S5 흡수반전' });
  if (absorbShort && shortReclaim) cands.push({ id: 'S5', dir: 'SHORT', ko: 'S5 흡수반전' });

  if (!cands.length) {
    return empty('병렬 셋업 없음 · 게이트 완화 안 함', 'NO_SETUP', {
      macro,
      thesis,
      battleZone,
      machineState: battleZone === 'PRIMARY' ? 'BATTLE_ZONE_ACTIVE' : 'CONTEXT_READY',
    });
  }

  const pick = cands.find((c) => {
    if (thesis === 'LONG_ALLOWED') return c.dir === 'LONG';
    if (thesis === 'SHORT_ALLOWED') return c.dir === 'SHORT';
    return true;
  }) || cands[0];

  const direction = pick.dir;
  if (thesis === 'LONG_ALLOWED' && direction === 'SHORT') {
    return empty('1H 테제 롱만 허용 · 숏 셋업 대기', 'NO_SETUP', { macro, thesis, battleZone, setupId: pick.id });
  }
  if (thesis === 'SHORT_ALLOWED' && direction === 'LONG') {
    return empty('1H 테제 숏만 허용 · 롱 셋업 대기', 'NO_SETUP', { macro, thesis, battleZone, setupId: pick.id });
  }

  const origin =
    Number(shift?.level || shift?.price) ||
    (direction === 'LONG' ? sellLiq : buyLiq) ||
    entry;
  const distAtr = Math.abs(entry - origin) / Math.max(atr, 1e-9);
  const retestTouch = distAtr <= 0.7;
  const retestHold = distAtr <= 0.5 && bodyRatio >= 0.22;
  if (!retestTouch) {
    return empty('리테스트 미도달 · SETUP_READY', 'SETUP_ONLY', {
      direction,
      setupId: pick.id,
      setupKo: pick.ko,
      macro,
      thesis,
      battleZone,
      machineState: 'SETUP_READY',
      eventId: `s${pick.id}-${sweepI >= 0 ? sweepI : asOf}`,
    });
  }
  if (!retestHold) {
    return empty('리테스트 터치만 · HOLD 아님', 'NO_RETEST_HOLD', {
      direction,
      setupId: pick.id,
      setupKo: pick.ko,
      macro,
      thesis,
      battleZone,
      machineState: 'RETEST_TOUCH',
    });
  }

  const last3 = bars.slice(Math.max(0, asOf - 2), asOf + 1);
  let oppFail = 40;
  if (direction === 'LONG') {
    const lows = last3.map((b) => Number(b.low));
    const vols = last3.map((b) => Number(b.volume) || 0);
    const noNewLow = lows[lows.length - 1] >= Math.min(...lows.slice(0, -1)) - atr * 0.04;
    const volDn = vols.length >= 2 && vols[vols.length - 1] <= vols[0] * 1.05;
    oppFail = clip(38 + (noNewLow ? 28 : 0) + (volDn ? 18 : 0) + (absorbLong ? 12 : 0), 0, 100);
  } else {
    const highs = last3.map((b) => Number(b.high));
    const vols = last3.map((b) => Number(b.volume) || 0);
    const noNewHigh = highs[highs.length - 1] <= Math.max(...highs.slice(0, -1)) + atr * 0.04;
    const volDn = vols.length >= 2 && vols[vols.length - 1] <= vols[0] * 1.05;
    oppFail = clip(38 + (noNewHigh ? 28 : 0) + (volDn ? 18 : 0) + (absorbShort ? 12 : 0), 0, 100);
  }
  if (oppFail < 55) {
    return empty('반대세력 실패 미확인', 'NO_OPPOSITE_FAILURE', {
      direction,
      setupId: pick.id,
      setupKo: pick.ko,
      macro,
      thesis,
      battleZone,
      oppositeFailure: oppFail,
      machineState: 'RETEST_HOLD',
    });
  }

  const m1 = params.candles1m || [];
  const m1AsOf = m1.length >= 4 ? closedIdx(m1.length) : -1;
  const m1bar = m1AsOf >= 0 ? m1[m1AsOf] : null;
  const m1Body =
    m1bar != null
      ? Math.abs(Number(m1bar.close) - Number(m1bar.open)) /
        Math.max(Number(m1bar.high) - Number(m1bar.low), 1e-8)
      : 0;
  const m1Ok =
    m1bar != null &&
    m1Body >= 0.38 &&
    ((direction === 'LONG' && Number(m1bar.close) > Number(m1bar.open)) ||
      (direction === 'SHORT' && Number(m1bar.close) < Number(m1bar.open)));
  const t3Ok =
    bodyRatio >= 0.4 &&
    ((direction === 'LONG' && cl > op) || (direction === 'SHORT' && cl < op));
  const microOk = m1.length >= 8 ? m1Ok : t3Ok;
  if (!microOk) {
    return empty('마이크로 트리거 미확정 · 미마감봉 사용 안 함', 'NO_MICRO_TRIGGER', {
      direction,
      setupId: pick.id,
      setupKo: pick.ko,
      macro,
      thesis,
      battleZone,
      oppositeFailure: oppFail,
      machineState: 'OPPOSITE_FAILURE',
    });
  }
  if (distAtr > SNIPER_CHASE_ATR) {
    return empty('트리거 후 추격 금지', 'CHASE', {
      direction,
      setupId: pick.id,
      machineState: 'MISSED',
    });
  }
  if (shiftAge > 5) {
    return empty('진입 창 만료', 'EXPIRED', { direction, setupId: pick.id, machineState: 'MISSED' });
  }

  const extreme =
    direction === 'LONG'
      ? Math.min(lo, Number(sweep?.price) || lo, sellLiq || lo)
      : Math.max(hi, Number(sweep?.price) || hi, buyLiq || hi);
  const buf = Math.max(atr * 0.22, entry * 0.0003);
  const executionSl = direction === 'LONG' ? extreme - buf : extreme + buf;
  const slPct = (Math.abs(entry - executionSl) / entry) * 100;
  if (!(slPct > 0.08) || slPct > 0.9) {
    return empty('실행 SL 거리 부적합', 'RR_LOW', { direction, setupId: pick.id });
  }

  let tpPct = SNIPER_DEFAULT_TP_PCT;
  const opp = direction === 'LONG' ? buyLiq : sellLiq;
  if (opp != null && opp > 0) {
    const spacePct = (Math.abs(opp - entry) / entry) * 100;
    if (spacePct < 0.22) return empty('목표공간 부족', 'RR_LOW', { direction, setupId: pick.id });
    if (spacePct < tpPct) tpPct = Math.max(0.3, spacePct * 0.82);
  }
  const tp = direction === 'LONG' ? entry * (1 + tpPct / 100) : entry * (1 - tpPct / 100);
  const reward = Math.abs(tp - entry);
  const riskPx = Math.abs(entry - executionSl);
  const feeEst = entry * 0.0008;
  const netRr = riskPx > 0 ? (reward - feeEst) / (riskPx + feeEst) : 0;
  if (netRr < 0.85) {
    return empty(`Net R:R ${netRr.toFixed(2)} 낮음`, 'RR_LOW', {
      direction,
      setupId: pick.id,
      netRr,
    });
  }

  const sized = sniperRiskSize({
    entry,
    sl: executionSl,
    equityUsdt: params.equityUsdt,
    riskPct: params.riskPct,
    maxLev: params.maxLev ?? SNIPER_MAX_LEV,
  });
  const gov = governIdeaRisk({
    equityUsdt: Math.max(50, Number(params.equityUsdt) || 1000),
    worstCaseLossUsdt: sized.riskAmount,
    requestedRiskPct: params.riskPct,
    slWidenRequested: false,
  });
  if (!gov.ok) {
    return empty(gov.reasonKo, 'RR_LOW', { direction, setupId: pick.id });
  }

  const locQ = edge ? 82 : 64;
  const setupQ = pick.id === 'S1' ? 80 : 70;
  const score = clip(
    locQ * 0.12 +
      setupQ * 0.16 +
      72 * 0.12 +
      oppFail * 0.14 +
      78 * 0.12 +
      0 * 0.1 +
      Math.min(90, netRr * 28) * 0.08 +
      (100 - distAtr * 40) * 0.08 +
      70 * 0.08,
    0,
    99
  );
  const grade: SniperGrade = score >= 90 ? 'ULTRA' : score >= 80 ? 'A+' : score >= 72 ? 'A' : score >= 65 ? 'WATCH' : 'WAIT';
  const fire = grade === 'ULTRA' || grade === 'A+';
  const eventId = `${pick.id}-${sweepI >= 0 ? sweepI : shiftI >= 0 ? shiftI : asOf}`;
  const dirKo = direction === 'LONG' ? '롱' : '숏';
  const reasonKo = fire
    ? `SNIPER ${dirKo} ${pick.ko} · TP1 ${tpPct.toFixed(2)}% · 실행SL ${slPct.toFixed(2)}% · ${sized.leverage}x(리스크) · 점수${score} · 표본없음`
    : `SNIPER 관망 · ${pick.ko} · 점수${score}`;

  return {
    engine: SNIPER_SCALP_ENGINE_ID,
    ok: fire,
    autoReady: fire,
    fire,
    direction,
    setupId: pick.id,
    setupKo: pick.ko,
    macro,
    thesis,
    battleZone,
    entry,
    executionSl,
    thesisInvalidation: thesisInv,
    tp,
    tpPct,
    slPct,
    netRr,
    sniperScore: score,
    oppositeFailure: oppFail,
    leverage: sized.leverage,
    riskR: 1,
    positionNotional: sized.notional,
    grade,
    machineState: fire ? 'FIRE' : 'ENTRY_WINDOW',
    waitReason: fire ? 'OK' : 'SETUP_ONLY',
    eventId,
    setupIdKey: `${pick.id}-${direction}-${eventId}`,
    sampleN: 0,
    sampleLabel: 'INSUFFICIENT',
    tpFirstProbability: null,
    fastGreen3m: null,
    expectedMae: null,
    reasonKo,
    whyKo: fire
      ? `${pick.ko} · 위치${battleZone} · 반대실패${oppFail} · 마이크로확정 · TP-FIRST 표본없음`
      : reasonKo,
  };
}
