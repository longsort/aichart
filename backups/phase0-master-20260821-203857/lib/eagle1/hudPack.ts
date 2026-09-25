/**
 * Eagle1 AI HUD view-model. Composes existing engines. Never invents %.
 */
import { formatSamplePct } from './noFakeNumbers';
import type { Eagle1Bar, StructureSnapshot } from './structureEngine';
import type { Eagle1MainPlan } from './signalEngine';
import type { Eagle1MoneyPressure, Eagle1MoneyPressureLive } from './moneyPressureBand';
import type { Eagle1SmartPath } from './smartPath';
import type { StructureAcceptanceReport } from './structureAcceptanceEngine';
import type { FalseBreakReport } from './falseBreakEngine';
import type { HistoricalOutcomeReport } from './historicalStatisticsEngine';
import { normalizeMtfTf, type MtfSequenceReport, type MtfFrameView } from './mtfSequence';
import type { FrozenTrade } from './tradeManage';
import type { VolumeProfileSlice } from './zoneEngine';
import { runBigMoveEngine, type BigMoveReport } from './bigMoveEngine';
import { runCandleEventEngine, type CandleEventMark } from './candleEventEngine';
import { buildPressureHeat, type HeatBar } from './pressureHeatmap';
import { runSchematicCompare, type SchematicCompareReport } from './schematicCompare';
import type { CombinationReport } from './combinationEngine';
import { runClockFlowEngine, type ClockFlowReport } from './clockFlowEngine';

/** 목업 BREAK RAIL — 엔진 상태(APPROACH…ACCEPT)를 한글 5단계로만 표시. */
export const HUD_BREAK_RAIL = ['접근', '돌파', '마감', '재시험', '안착'] as const;

export const HUD_TRADE_RAIL = [
  'SETUP',
  'WAITING',
  'TRIGGERED',
  'OPEN',
  'TP1',
  'BE',
  'TP2',
  'TRAIL',
  'TP3',
  'EXIT',
] as const;

export type HudTradeStep = (typeof HUD_TRADE_RAIL)[number];

export type HudCheck = { id: string; labelKo: string; hit: boolean | null; note: string };

export type Eagle1HudPack = {
  bigMove: BigMoveReport;
  battle: { longPct: number | null; shortPct: number | null; note: string };
  mtfCompass: Array<{ tf: string; arrow: '↑' | '↓' | '→'; bias: 'up' | 'down' | 'flat'; note: string }>;
  compassConflict: string | null;
  breakRail: { steps: string[]; current: string; fail: string | null; targetEn: string };
  tradeStatus: { current: HudTradeStep; note: string };
  entryQuality: { score: number | null; labelKo: string; note: string };
  marketState: { labelKo: string; tone: 'long' | 'short' | 'wait' };
  volumeFlow: { value: number | null; labelKo: string };
  flowDirection: { labelKo: string; arrows: 1 | 2 | 3 | 0 };
  events: CandleEventMark[];
  heat: HeatBar[];
  rangePressure: Array<{ price: number; intensity: number; side: 'buy' | 'sell' | 'poc' }>;
  rangeKind: 'ACCUMULATION' | 'DISTRIBUTION' | 'NEUTRAL' | 'COMPRESSION' | 'NONE';
  schematic: SchematicCompareReport;
  bigLong: { active: boolean; checks: HudCheck[] };
  cascadeShort: { active: boolean; checks: HudCheck[] };
  pathProbability: { text: string; sample: number };
  summary: string;
  combination: CombinationReport | null;
  flowSync: { labelKo: string; note: string };
  clockFlow: ClockFlowReport;
  lobResiliency: { labelKo: string; note: string };
  coverage: Array<{ tf: string; rows: number; gaps: number; firstIso: string | null; lastIso: string | null }>;
  entryZoneState: 'WAIT' | 'WATCH' | 'APPROACH' | 'READY' | 'TRIGGERED' | 'OPEN' | 'MISSED' | 'INVALID';
  paths: Array<{ id: string; labelEn: string; text: string; sample: number; note: string }>;
};

function shareToBattle(money: Eagle1MoneyPressure | null, live: Eagle1MoneyPressureLive | null): Eagle1HudPack['battle'] {
  if (live?.has_orderbook && typeof live.orderbookImbalance === 'number') {
    const longPct = Math.round(((live.orderbookImbalance + 1) / 2) * 100);
    return { longPct, shortPct: 100 - longPct, note: '라이브 호가 불균형 · 확률 아님' };
  }
  if (money != null && Number.isFinite(money.buyShare)) {
    const longPct = Math.round(money.buyShare * 100);
    return { longPct, shortPct: 100 - longPct, note: '공격 체결 비중 · 확률 아님' };
  }
  return { longPct: null, shortPct: null, note: '데이터 없음' };
}

function compass(mtf: MtfSequenceReport | null, extra?: MtfFrameView[] | null): Eagle1HudPack['mtfCompass'] {
  const want = ['1M', '1W', '1D', '4H', '1H', '15m', '5m', '1m'];
  const frames = [...(extra ?? []), ...(mtf?.frames ?? [])];
  return want.map((tf) => {
    const row = frames.find((f) => normalizeMtfTf(String(f.tf)) === tf);
    if (!row || row.bias == null) {
      return { tf, arrow: '→' as const, bias: 'flat' as const, note: '데이터 없음' };
    }
    if (row.bias === 'bullish') return { tf, arrow: '↑' as const, bias: 'up' as const, note: row.state };
    return { tf, arrow: '↓' as const, bias: 'down' as const, note: row.state };
  });
}

function compassConflictKo(rows: Eagle1HudPack['mtfCompass']): string | null {
  const ltf = rows.filter((r) => ['1m', '5m', '15m', '1H'].includes(r.tf) && r.bias !== 'flat');
  const htf = rows.filter((r) => ['4H', '1D', '1W', '1M'].includes(r.tf) && r.bias !== 'flat');
  if (!ltf.length || !htf.length) return null;
  const side = (xs: Eagle1HudPack['mtfCompass']) => {
    const up = xs.filter((r) => r.bias === 'up').length;
    const dn = xs.filter((r) => r.bias === 'down').length;
    if (up === dn) return null;
    return up > dn ? 'up' : 'down';
  };
  const a = side(ltf);
  const b = side(htf);
  if (!a || !b || a === b) return null;
  return a === 'up' ? '단기 상승 / 상위 하락' : '단기 하락 / 상위 상승';
}

function lobFromLive(live: Eagle1MoneyPressureLive | null | undefined): Eagle1HudPack['lobResiliency'] {
  if (!live?.has_orderbook) {
    return { labelKo: '데이터 없음', note: '라이브 호가 없음 · 복원속도 시리즈 없음' };
  }
  const spread =
    live.spreadBps != null && Number.isFinite(live.spreadBps) ? `${live.spreadBps.toFixed(1)}bps` : '데이터 없음';
  const depth =
    live.bidQty != null && live.askQty != null
      ? `호가 5단 ${live.bidQty.toFixed(3)}/${live.askQty.toFixed(3)}`
      : '호가 깊이 데이터 없음';
  const nBook = Math.max(0, Math.floor(live.bookSeriesPoints ?? 0));
  if (nBook < 2) {
    return {
      labelKo: `스냅샷 스프레드 ${spread} · 복원속도 시리즈 없음`,
      note: `${depth} · replenishment 시계열 미수집`,
    };
  }
  if (live.replenishScore == null || !Number.isFinite(live.replenishScore)) {
    return {
      labelKo: `스냅샷 스프레드 ${spread} · 소진 후 복원 이벤트 없음`,
      note: `${depth} · 호가 스냅 ${nBook}`,
    };
  }
  const bid =
    live.replenishBid != null ? `매수복원 ${(live.replenishBid * 100).toFixed(0)}` : '매수복원 데이터 없음';
  const ask =
    live.replenishAsk != null ? `매도복원 ${(live.replenishAsk * 100).toFixed(0)}` : '매도복원 데이터 없음';
  return {
    labelKo: `스프레드 ${spread} · ${bid} · ${ask}`,
    note: `${depth} · 호가 스냅 ${nBook} · 복원비율 실측 · 확률 아님`,
  };
}

function flowSyncFromMtf(
  mtf: MtfSequenceReport | null,
  extra?: MtfFrameView[] | null
): Eagle1HudPack['flowSync'] {
  const frames = extra?.length ? extra : mtf?.frames ?? [];
  const known = frames.filter((f) => f.bias != null);
  if (!known.length) {
    return { labelKo: 'Bitget Only', note: '교차거래소 없음 · TF 바이어스 데이터 없음' };
  }
  const up = known.filter((f) => f.bias === 'bullish').length;
  const conflict = mtf?.aligned === false;
  return {
    labelKo: `Bitget MTF ${up}/${known.length} 상방`,
    note: conflict
      ? '상위/하위 TF 충돌 · 교차거래소 없음 · 확률 아님'
      : 'Bitget 선물 TF 일치율 · 교차거래소 없음 · 확률 아님',
  };
}

function entryZoneState(
  plan: Eagle1MainPlan | null,
  trade: FrozenTrade | null,
  acc: StructureAcceptanceReport | null
): Eagle1HudPack['entryZoneState'] {
  if (trade?.state === 'INVALIDATED') return 'INVALID';
  if (
    trade?.state === 'OPEN' ||
    trade?.state === 'TP1_HIT' ||
    trade?.state === 'TP2_HIT' ||
    trade?.state === 'TP3_HIT' ||
    trade?.state === 'BREAKEVEN'
  ) {
    return 'OPEN';
  }
  if (plan?.status === 'LONG_MISSED' || plan?.status === 'SHORT_MISSED') return 'MISSED';
  if (plan?.status === 'CONFIRMED_LONG' || plan?.status === 'CONFIRMED_SHORT') return 'TRIGGERED';
  const watch =
    plan?.status === 'LONG_WATCH' ||
    plan?.status === 'SHORT_WATCH' ||
    (plan?.status === 'WAIT' && plan.direction != null && plan.entryLow != null);
  const st = acc?.state ?? '';
  if (watch && (st === 'ACCEPTED' || st === 'HOLD' || st === 'RETEST' || st === 'CLOSE_CONFIRM')) return 'READY';
  if (watch) return 'WATCH';
  if (st === 'APPROACH' || st === 'TOUCH' || st === 'WICK_BREAK') return 'APPROACH';
  return 'WAIT';
}

function pathRows(path: Eagle1SmartPath | null): Eagle1HudPack['paths'] {
  const rows = [
    path?.main ?? null,
    path?.alt ?? null,
    path?.break ?? null,
  ];
  const labels = ['MAIN PATH', 'ALT PATH', 'BREAK PATH'];
  return rows.map((row, i) => ({
    id: row?.id ?? ['main', 'alt', 'break'][i]!,
    labelEn: labels[i]!,
    text: formatSamplePct(row?.sampleSize ?? 0, row?.probability ?? null),
    sample: row?.sampleSize ?? 0,
    note: row?.note ?? '데이터 없음',
  }));
}

function tradeStep(plan: Eagle1MainPlan | null, trade: FrozenTrade | null): { current: HudTradeStep; note: string } {
  if (trade?.state === 'INVALIDATED') return { current: 'EXIT', note: '무효' };
  if (trade?.state === 'TP3_HIT') return { current: 'TP3', note: '목표3 도달' };
  if (trade?.state === 'TP2_HIT') return { current: 'TRAIL', note: '목표2 이후 추적' };
  if (trade?.state === 'BREAKEVEN') return { current: 'BE', note: '본전' };
  if (trade?.state === 'TP1_HIT') return { current: 'TP1', note: '목표1 도달' };
  if (trade?.state === 'OPEN') return { current: 'OPEN', note: '진행' };
  if (plan?.status === 'CONFIRMED_LONG' || plan?.status === 'CONFIRMED_SHORT') {
    return { current: 'TRIGGERED', note: plan.status === 'CONFIRMED_LONG' ? '확정롱' : '확정숏' };
  }
  if (plan?.status === 'LONG_WATCH' || plan?.status === 'SHORT_WATCH') {
    return { current: 'WAITING', note: '감시' };
  }
  if (plan?.status === 'WAIT' && plan.direction != null && plan.entryLow != null) {
    return { current: 'WAITING', note: '감시레벨 · 미확정' };
  }
  if (plan?.status === 'LONG_MISSED' || plan?.status === 'SHORT_MISSED') {
    return { current: 'SETUP', note: '추격 금지' };
  }
  return { current: 'SETUP', note: '대기' };
}

function entryQuality(plan: Eagle1MainPlan | null): Eagle1HudPack['entryQuality'] {
  if (!plan || plan.direction == null) {
    return { score: null, labelKo: '데이터 없음', note: '메인 엔트리 없음' };
  }
  if (plan.status === 'LONG_MISSED' || plan.status === 'SHORT_MISSED') {
    return { score: null, labelKo: '추격 금지', note: '검증 진입에서 이탈 · 확률 아님' };
  }
  const agr = Number.isFinite(plan.agreementScore) ? plan.agreementScore : 0;
  const rr = plan.netRr != null && Number.isFinite(plan.netRr) ? Math.min(24, plan.netRr * 6) : 0;
  const qBoost = plan.entryQuality === 'good' ? 16 : plan.entryQuality === 'ok' ? 8 : 0;
  const score = Math.max(1, Math.min(100, Math.round(agr + rr + qBoost)));
  if (plan.entryQuality === 'poor' && score < 40) {
    return { score, labelKo: '진입 품질 낮음', note: '합의·RR 합산 · 확률 아님' };
  }
  if (score >= 70) {
    return { score, labelKo: '진입 조건 양호', note: '합의·RR 합산 · 확률 아님' };
  }
  return { score, labelKo: '보통', note: '추가 확인 필요 · 확률 아님' };
}

function rangeMap(profile: VolumeProfileSlice | null | undefined): Eagle1HudPack['rangePressure'] {
  const poc = profile?.poc;
  const hvn = profile?.hvn ?? [];
  if (poc == null && !hvn.length) return [];
  const prices = [...hvn.slice(0, 10), ...(poc != null ? [poc] : [])];
  const uniq = [...new Set(prices.filter((p) => Number.isFinite(p)))].sort((a, b) => b - a);
  return uniq.slice(0, 12).map((price) => ({
    price,
    intensity: poc != null && Math.abs(price - poc) < 1e-9 ? 1 : 0.55,
    side: poc == null ? 'poc' : price > poc ? 'sell' : price < poc ? 'buy' : 'poc',
  }));
}

function chk(id: string, labelKo: string, hit: boolean | null): HudCheck {
  return { id, labelKo, hit, note: hit == null ? '데이터 없음' : hit ? '충족' : '미충족' };
}

export function buildEagle1HudPack(params: {
  candles: Eagle1Bar[];
  endExclusive?: number;
  structure: StructureSnapshot;
  plan: Eagle1MainPlan | null;
  trade: FrozenTrade | null;
  money: Eagle1MoneyPressure | null;
  live?: Eagle1MoneyPressureLive | null;
  path: Eagle1SmartPath | null;
  acceptance: StructureAcceptanceReport | null;
  falseBreak: FalseBreakReport | null;
  hist: HistoricalOutcomeReport | null;
  mtf: MtfSequenceReport | null;
  profile?: VolumeProfileSlice | null;
  combination?: CombinationReport | null;
  candleEvents?: CandleEventMark[] | null;
  clockCandles15m?: Eagle1Bar[] | null;
  compassFrames?: MtfFrameView[] | null;
  coverage?: Eagle1HudPack['coverage'] | null;
}): Eagle1HudPack {
  const end = params.endExclusive ?? params.candles.length;
  const bigMove = runBigMoveEngine({
    candles: params.candles,
    endExclusive: end,
    money: params.money,
    live: params.live,
    regime: params.structure.regime,
  });
  const events = params.candleEvents?.length
    ? params.candleEvents
    : runCandleEventEngine({
    candles: params.candles,
    events: params.structure.events,
    money: params.money,
    endExclusive: end,
  });
  const schematic = runSchematicCompare({
    structure: params.structure,
    candles: params.candles,
    pocState: params.profile?.pocState,
    sampleSize: params.hist?.totalSample ?? params.plan?.sampleSize ?? 0,
    endExclusive: end,
  });
  const wy = params.structure.wyckoff?.label;
  const marketState: Eagle1HudPack['marketState'] = {
    labelKo: schematic.chartLabelKo,
    tone: schematic.tone,
  };

  const acc = params.acceptance;
  const closeOk = acc?.state === 'CLOSE_CONFIRM' || acc?.state === 'HOLD' || acc?.state === 'ACCEPTED';
  const retestOk = acc?.state === 'HOLD' || acc?.state === 'ACCEPTED';
  const bookUp =
    params.live?.has_orderbook && typeof params.live.orderbookImbalance === 'number'
      ? params.live.orderbookImbalance > 0
      : null;
  const cvdUp =
    params.live?.has_cvd && typeof params.live.volumeDelta === 'number' ? params.live.volumeDelta > 0 : null;
  const ofiUp =
    params.live?.has_ofi && typeof params.live.ofi === 'number' ? params.live.ofi > 0 : null;
  const ofiDn =
    params.live?.has_ofi && typeof params.live.ofi === 'number' ? params.live.ofi < 0 : null;
  const liqAccel = params.live?.liqAccel ?? null;
  const longChecks: HudCheck[] = [
    chk('resBreak', '저항 돌파', acc?.bias === 'bullish' && (acc.state === 'BREAK' || closeOk || retestOk)),
    chk('close', '15m 종가 확인', acc?.bias === 'bullish' && closeOk),
    chk('retest', '재시험 유지', acc?.bias === 'bullish' && retestOk),
    chk('ofi', 'OFI 상승', ofiUp),
    chk('book', '라이브 호가', bookUp),
    chk('cvd', 'CVD 상승', cvdUp),
    chk('sample', '표본 충분', (params.plan?.sampleSize ?? 0) >= 30),
  ];
  const shortChecks: HudCheck[] = [
    chk('supBreak', '지지 이탈', acc?.bias === 'bearish' && (acc.state === 'BREAK' || closeOk || retestOk)),
    chk('closeDn', '종가 아래', acc?.bias === 'bearish' && closeOk),
    chk('retestFail', '재시험 실패', params.falseBreak?.kind === 'FAKE_BREAKDOWN' ? false : acc?.activeFail === 'FAILED_RECLAIM'),
    chk('ofiDn', '매도 OFI', ofiDn),
    chk('bookDn', '라이브 호가 매도', bookUp == null ? null : !bookUp),
    chk('cvdDn', 'CVD 하락', cvdUp == null ? null : !cvdUp),
    chk('liq', '청산 가속', liqAccel),
  ];
  const longHits = longChecks.filter((c) => c.hit === true).length;
  const shortHits = shortChecks.filter((c) => c.hit === true).length;

  const vd = params.live?.has_cvd && typeof params.live.volumeDelta === 'number' ? params.live.volumeDelta : null;
  const flowArrows: 1 | 2 | 3 | 0 =
    params.money == null ? 0 : params.money.score >= 22 ? 3 : params.money.score >= 10 ? 2 : params.money.score > 0 ? 1 : 0;
  const sample = params.path?.main.sampleSize ?? params.plan?.sampleSize ?? 0;

  const compassRows = compass(params.mtf, params.compassFrames);
  const summaryBits = [
    acc?.uiLabel ?? '대기',
    marketState.labelKo,
    params.plan?.status === 'WAIT' ? '메인플랜 대기' : params.plan?.status ?? '',
  ].filter(Boolean);

  return {
    bigMove,
    battle: shareToBattle(params.money, params.live ?? null),
    mtfCompass: compassRows,
    compassConflict: compassConflictKo(compassRows),
    breakRail: {
      steps: [...HUD_BREAK_RAIL],
      current: acc?.state ?? 'IDLE',
      fail: acc?.activeFail ?? null,
      targetEn: acc?.bias === 'bullish' ? 'RESISTANCE' : acc?.bias === 'bearish' ? 'SUPPORT' : '데이터 없음',
    },
    tradeStatus: tradeStep(params.plan, params.trade),
    entryQuality: entryQuality(params.plan),
    marketState,
    volumeFlow: {
      value: vd,
      labelKo: vd == null ? '데이터 없음' : vd >= 0 ? '순매수 유입' : '순매도 유입',
    },
    flowDirection: {
      labelKo:
        flowArrows === 0
          ? params.money == null
            ? '데이터 없음'
            : '하방 압력'
          : flowArrows === 3
            ? '상방 압력 강함'
            : '상방 압력',
      arrows: params.money != null && params.money.score < 0 ? 0 : flowArrows,
    },
    events,
    heat: buildPressureHeat({ candles: params.candles, endExclusive: end, live: params.live }),
    rangePressure: rangeMap(params.profile),
    schematic,
    rangeKind:
      bigMove.state === 'COMPRESSION'
        ? 'COMPRESSION'
        : wy === 'ACCUMULATION'
          ? 'ACCUMULATION'
          : wy === 'DISTRIBUTION'
            ? 'DISTRIBUTION'
            : params.structure.regime === 'RANGE'
              ? 'NEUTRAL'
              : 'NONE',
    bigLong: { active: longHits >= 4 && (params.plan?.direction === 'LONG' || acc?.bias === 'bullish'), checks: longChecks },
    cascadeShort: {
      active: shortHits >= 4 && (params.plan?.direction === 'SHORT' || acc?.bias === 'bearish' || bigMove.state === 'CASCADE'),
      checks: shortChecks,
    },
    pathProbability: {
      text: formatSamplePct(sample, params.path?.main.probability ?? params.plan?.calibratedProbability ?? null),
      sample,
    },
    summary: summaryBits.join(' · '),
    combination: params.combination ?? null,
    flowSync: flowSyncFromMtf(params.mtf, params.compassFrames),
    clockFlow: runClockFlowEngine({
      candles15m: params.clockCandles15m,
      asOfTime: params.candles[Math.max(0, end - 1)]?.time,
      ofi10s: params.live?.ofi10s,
    }),
    lobResiliency: lobFromLive(params.live),
    coverage: params.coverage ?? [],
    entryZoneState: entryZoneState(params.plan, params.trade, params.acceptance),
    paths: pathRows(params.path),
  };
}
