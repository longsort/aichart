/**
 * 통합모드 — 캔들·카드 기능별 지지/저항·거래량·안착·반등·현물 시뮬 통계.
 * 조건부 비율·표본 기반 — 확정 승률·수익 보장 아님.
 */
import type { AnalyzeResponse, Candle, OverlayItem } from '@/types';
import { ema, atrSeries } from '@/lib/indicators';
import type { MergedDeskActiveTradePlan } from '@/lib/mergedDeskActiveTradePlan';
import type { CandleCardConfluencePack } from '@/lib/mergedDeskCandleCardConfluence';
import type { TfCloseSettleBoard, TfCloseSettleRow } from '@/lib/tfCloseSettleAssessment';
import { chartTfToCloseSettleTf } from '@/lib/tfCloseSettleAssessment';

export type FeatureStatsChipId =
  | 'overview'
  | 'mode'
  | 'avwapAi'
  | 'sr'
  | 'volume'
  | 'settle'
  | 'bounce'
  | 'spot'
  | 'card'
  | 'extra';

export const FEATURE_STATS_CHIPS: ReadonlyArray<{
  id: FeatureStatsChipId;
  labelKo: string;
  hintKo: string;
}> = [
  { id: 'overview', labelKo: '전체', hintKo: '한눈 요약 — 아래로 전부 이어짐' },
  { id: 'mode', labelKo: '모드기능', hintKo: '통합모드 전 기능 ON·통계 맵' },
  { id: 'avwapAi', labelKo: 'AVWAP·AI', hintKo: '통계×피보·골든·헌팅 롱/숏/WAIT 합류' },
  { id: 'sr', labelKo: '지지저항', hintKo: 'EMA·스윙·존·AVWAP·Hot 터치 통계' },
  { id: 'volume', labelKo: '거래량', hintKo: '상승·하락봉·돌파 시 거래량' },
  { id: 'settle', labelKo: '안착마감', hintKo: '종가안착·실패 후 방향 정확도' },
  { id: 'bounce', labelKo: '반등돌파', hintKo: '지지 반등 · 저항 거절 · 실패돌파' },
  { id: 'spot', labelKo: '현물시뮬', hintKo: '이벤트 후 N봉 상승/하락 %' },
  { id: 'card', labelKo: '카드합류', hintKo: 'Hub·ActiveTrade·캔들카드' },
  { id: 'extra', labelKo: '더보기', hintKo: '연속성·RR·늦은진입·변동성' },
];

export type FeatureLevelKind =
  | 'ema20'
  | 'ema50'
  | 'ema200'
  | 'pivotHigh'
  | 'pivotLow'
  | 'priorHigh'
  | 'priorLow'
  | 'zoneSupply'
  | 'zoneDemand'
  | 'avwap'
  | 'hotZone'
  | 'hqEntry'
  | 'stBand'
  | 'msb'
  | 'channel'
  | 'poc'
  | 'activeEntry'
  | 'activeSl'
  | 'activeTp';

export type FeatureLevelRow = {
  id: string;
  kind: FeatureLevelKind;
  labelKo: string;
  role: 'support' | 'resistance' | 'both';
  touches: number;
  supportHoldPct: number | null;
  resistRejectPct: number | null;
  breakPct: number | null;
  avgVolVsSma: number | null;
  sampleOk: boolean;
};

/** 통합모드 기능 맵 — 실제 켜진 기능 + 통계 연결 */
export type ModeFeatureRow = {
  id: string;
  groupKo: string;
  labelKo: string;
  liveKo: string;
  statKo: string | null;
  linked: boolean;
  tone: 'good' | 'warn' | 'neutral';
};

export type VolumeRegimeRow = {
  id: string;
  labelKo: string;
  sample: number;
  avgRvol: number;
  medianClosePct: number | null;
  upSharePct: number | null;
  noteKo: string;
};

export type SettleSimRow = {
  id: string;
  labelKo: string;
  sample: number;
  nextDirHitPct: number | null;
  medianNextPct: number | null;
  sampleLowTrust: boolean;
  noteKo: string;
};

export type BounceSimRow = {
  id: string;
  labelKo: string;
  sample: number;
  successPct: number | null;
  medianMfePct: number | null;
  medianMaePct: number | null;
  noteKo: string;
};

export type SpotSimRow = {
  id: string;
  labelKo: string;
  horizonBars: number;
  sample: number;
  upPct: number | null;
  downPct: number | null;
  medianPct: number | null;
  hitTpBeforeSlPct: number | null;
  sampleLowTrust: boolean;
  noteKo: string;
};

export type CardAlignRow = {
  id: string;
  labelKo: string;
  valueKo: string;
  tone: 'good' | 'warn' | 'neutral';
};

export type ExtraStatRow = {
  id: string;
  labelKo: string;
  valueKo: string;
  noteKo?: string;
};

/** AVWAP·AI 합류 — 통계 패널·차트 공용 (순환 import 방지용 최소 타입) */
export type FeatureStatsAvwapAiSnap = {
  bias: 'long' | 'short' | 'wait';
  longScore: number;
  shortScore: number;
  confidence: number;
  entryAllowed: boolean;
  titleKo: string;
  summaryKo: string;
  votes: Array<{
    id: string;
    groupKo: string;
    labelKo: string;
    side: 'long' | 'short' | 'wait';
    weight: number;
    noteKo: string;
  }>;
  targets: {
    pullbackKo: string | null;
    reboundKo: string | null;
    huntKo: string | null;
    settleKo: string | null;
  };
  disclaimerKo: string;
};

export type MergedDeskFeatureStatsPack = {
  symbol: string;
  timeframe: string;
  barCount: number;
  lookback: number;
  builtAtIso: string;
  disclaimerKo: string;
  overviewKo: string[];
  modeFeatures: ModeFeatureRow[];
  levels: FeatureLevelRow[];
  volume: VolumeRegimeRow[];
  settle: SettleSimRow[];
  bounce: BounceSimRow[];
  spot: SpotSimRow[];
  card: CardAlignRow[];
  extra: ExtraStatRow[];
  headline: {
    bestSupportKo: string | null;
    bestResistKo: string | null;
    volBiasKo: string | null;
    settleBiasKo: string | null;
  };
  /** 통계×AVWAP피보 합류 — 있으면 패널 AVWAP·AI 섹션 */
  avwapAi?: FeatureStatsAvwapAiSnap | null;
};

const SAMPLE_TRUST_MIN = 10;
const HORIZONS = [3, 8, 21] as const;

function pct(n: number, d: number): number | null {
  if (!(d > 0)) return null;
  return Math.round((1000 * n) / d) / 10;
}

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

function fmtPct(n: number | null, digits = 1): string {
  if (n == null || !Number.isFinite(n)) return '—';
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toFixed(digits)}%`;
}

function smaAt(vols: number[], i: number, period: number): number {
  if (i < period - 1) return vols[i] || 0;
  let s = 0;
  for (let j = i - period + 1; j <= i; j++) s += vols[j] || 0;
  return s / period;
}

function pivotHighsLows(candles: Candle[], left = 3, right = 3): { hi: number[]; lo: number[] } {
  const hi: number[] = [];
  const lo: number[] = [];
  for (let i = left; i < candles.length - right; i++) {
    const c = candles[i]!;
    let isH = true;
    let isL = true;
    for (let j = i - left; j <= i + right; j++) {
      if (j === i) continue;
      if (candles[j]!.high >= c.high) isH = false;
      if (candles[j]!.low <= c.low) isL = false;
    }
    if (isH) hi.push(c.high);
    if (isL) lo.push(c.low);
  }
  return { hi, lo };
}

type LevelSeries = {
  id: string;
  kind: FeatureLevelKind;
  labelKo: string;
  role: 'support' | 'resistance' | 'both';
  /** per-bar price; 0 = inactive */
  series: Float64Array;
};

function pushFixedLevel(
  out: LevelSeries[],
  id: string,
  kind: FeatureLevelKind,
  labelKo: string,
  role: 'support' | 'resistance' | 'both',
  price: number,
  n: number,
  startFrac = 0.25
): void {
  if (!(price > 0) || !Number.isFinite(price)) return;
  if (out.some((x) => x.id === id)) return;
  const series = new Float64Array(n);
  const start = Math.max(0, Math.floor(n * startFrac));
  for (let i = start; i < n; i++) series[i] = price;
  out.push({ id, kind, labelKo, role, series });
}

function classifyDeskOverlay(o: OverlayItem): {
  kind: FeatureLevelKind;
  labelKo: string;
  role: 'support' | 'resistance' | 'both';
} | null {
  const kind = String(o.kind || '');
  const cat = String(o.category || '');
  const id = String(o.id || '');
  const label = String(o.label || '');
  const blob = `${id} ${label} ${cat} ${kind}`.toLowerCase();

  if (/avwap|anchored.?vwap|시가앵커|고가앵커/.test(blob)) {
    return { kind: 'avwap', labelKo: label || 'AVWAP', role: 'both' };
  }
  if (/hotzone|hot-zone|merged-desk-hot|\$\$\$\$/.test(blob)) {
    const short = /short|숏|sell|저항/.test(blob);
    return {
      kind: 'hotZone',
      labelKo: label || (short ? 'Hot존숏' : 'Hot존롱'),
      role: short ? 'resistance' : 'support',
    };
  }
  if (/hq-entry|merged-hq|hq진입|hq /.test(blob)) {
    return { kind: 'hqEntry', labelKo: label || 'HQ진입', role: 'both' };
  }
  if (/institutional|st.?touch|기관|super.?trend|ib-touch/.test(blob)) {
    const short = /short|숏|저항|sell/.test(blob);
    return {
      kind: 'stBand',
      labelKo: label || (short ? '기관ST저항' : '기관ST지지'),
      role: short ? 'resistance' : 'support',
    };
  }
  if (/msb|구조돌파|break.?of.?structure|smc-poi|breaker/.test(blob)) {
    const down = /↓|down|숏|bear|저항/.test(blob);
    return {
      kind: 'msb',
      labelKo: label || (down ? 'MSB저항' : 'MSB지지'),
      role: down ? 'resistance' : 'support',
    };
  }
  if (/rb-|channel|파랑|빨강|채널|blue.?red/.test(blob)) {
    return { kind: 'channel', labelKo: label || '청적채널', role: 'both' };
  }
  if (/poc|vrvp|value.?area|va-/.test(blob)) {
    return { kind: 'poc', labelKo: label || 'POC', role: 'both' };
  }
  if (kind === 'supplyZone' || /supply|매도공급|저항존/.test(blob)) {
    return { kind: 'zoneSupply', labelKo: label || '공급존', role: 'resistance' };
  }
  if (kind === 'demandZone' || /demand|매수수요|지지존/.test(blob)) {
    return { kind: 'zoneDemand', labelKo: label || '수요존', role: 'support' };
  }
  if (/entry.?zone|진입존|merged-desk-entry/.test(blob)) {
    return { kind: 'hqEntry', labelKo: label || '진입존', role: 'both' };
  }
  return null;
}

function buildLevelSeries(
  candles: Candle[],
  overlays?: OverlayItem[] | null,
  activeTrade?: MergedDeskActiveTradePlan | null
): LevelSeries[] {
  const n = candles.length;
  const closes = candles.map((c) => c.close);
  const e20 = ema(closes, 20);
  const e50 = ema(closes, 50);
  const e200 = ema(closes, Math.min(200, Math.max(40, Math.floor(n / 2))));
  const out: LevelSeries[] = [];

  const pushEma = (kind: FeatureLevelKind, labelKo: string, arr: number[]) => {
    const series = new Float64Array(n);
    for (let i = 0; i < n; i++) series[i] = arr[i] || 0;
    out.push({ id: kind, kind, labelKo, role: 'both', series });
  };
  pushEma('ema20', 'EMA20', e20);
  pushEma('ema50', 'EMA50', e50);
  if (n >= 60) pushEma('ema200', 'EMA200', e200);

  const piv = pivotHighsLows(candles);
  const lastHi = piv.hi.slice(-8);
  const lastLo = piv.lo.slice(-8);
  if (lastHi.length) {
    pushFixedLevel(out, 'pivotHigh', 'pivotHigh', '스윙고점', 'resistance', lastHi[lastHi.length - 1]!, n, 0.3);
  }
  if (lastLo.length) {
    pushFixedLevel(out, 'pivotLow', 'pivotLow', '스윙저점', 'support', lastLo[lastLo.length - 1]!, n, 0.3);
  }

  if (n >= 24) {
    const look = Math.min(48, Math.floor(n / 3));
    let ph = -Infinity;
    let pl = Infinity;
    for (let i = n - look - 8; i < n - 8; i++) {
      if (i < 0) continue;
      ph = Math.max(ph, candles[i]!.high);
      pl = Math.min(pl, candles[i]!.low);
    }
    if (Number.isFinite(ph) && ph > 0) {
      pushFixedLevel(out, 'priorHigh', 'priorHigh', '직전고점대', 'resistance', ph, n, 1 - look / n);
    }
    if (Number.isFinite(pl) && pl > 0) {
      pushFixedLevel(out, 'priorLow', 'priorLow', '직전저점대', 'support', pl, n, 1 - look / n);
    }
  }

  /** 통합데스크 오버레이 → 기능별 레벨 */
  if (overlays?.length) {
    const caps: Record<string, number> = {
      avwap: 3,
      hotZone: 4,
      hqEntry: 3,
      stBand: 3,
      msb: 4,
      channel: 3,
      poc: 2,
      zoneSupply: 3,
      zoneDemand: 3,
    };
    const used: Record<string, number> = {};
    for (const o of overlays) {
      const p1 = Number(o.price1);
      const p2 = Number(o.price2);
      const mid =
        Number.isFinite(p1) && Number.isFinite(p2) && p1 > 0 && p2 > 0
          ? (p1 + p2) / 2
          : Number.isFinite(p1) && p1 > 0
            ? p1
            : 0;
      if (!(mid > 0)) continue;
      const cls = classifyDeskOverlay(o);
      if (!cls) continue;
      const k = cls.kind;
      used[k] = (used[k] || 0) + 1;
      if (used[k]! > (caps[k] || 2)) continue;
      const labelKo =
        used[k]! > 1 ? `${cls.labelKo.replace(/\d+$/, '')}${used[k]}` : cls.labelKo;
      pushFixedLevel(out, `${k}-${used[k]}`, k, labelKo.slice(0, 18), cls.role, mid, n, 0.35);
    }
  }

  /** ActiveTrade E/SL/TP — 라이브 카드 타점 */
  if (activeTrade && activeTrade.direction !== 'NEUTRAL') {
    const dir = activeTrade.direction;
    pushFixedLevel(
      out,
      'activeEntry',
      'activeEntry',
      `Active진입`,
      'both',
      activeTrade.entry,
      n,
      0.55
    );
    pushFixedLevel(
      out,
      'activeSl',
      'activeSl',
      `Active손절`,
      dir === 'LONG' ? 'support' : 'resistance',
      activeTrade.stopLoss,
      n,
      0.55
    );
    if (activeTrade.tp1 > 0) {
      pushFixedLevel(
        out,
        'activeTp',
        'activeTp',
        `Active목표`,
        dir === 'LONG' ? 'resistance' : 'support',
        activeTrade.tp1,
        n,
        0.55
      );
    }
  }

  return out;
}

type TouchEvent = {
  i: number;
  level: number;
  fromAbove: boolean;
  rvol: number;
};

function collectTouches(
  candles: Candle[],
  series: Float64Array,
  atr: number[],
  vols: number[],
  startI: number
): TouchEvent[] {
  const out: TouchEvent[] = [];
  let cooldown = 0;
  for (let i = startI; i < candles.length - 2; i++) {
    if (cooldown > 0) {
      cooldown -= 1;
      continue;
    }
    const lv = series[i] || 0;
    if (!(lv > 0)) continue;
    const c = candles[i]!;
    const tol = Math.max((atr[i] || 0) * 0.22, lv * 0.0008);
    if (c.low > lv + tol || c.high < lv - tol) continue;
    const smaV = smaAt(vols, i, 20);
    const rvol = smaV > 0 ? (vols[i] || 0) / smaV : 1;
    const fromAbove = c.close >= lv || (c.open + c.close) / 2 >= lv;
    out.push({ i, level: lv, fromAbove, rvol });
    cooldown = 2;
  }
  return out;
}

function scoreLevel(
  candles: Candle[],
  level: LevelSeries,
  atr: number[],
  vols: number[],
  startI: number,
  horizon: number
): FeatureLevelRow {
  const touches = collectTouches(candles, level.series, atr, vols, startI);
  let hold = 0;
  let holdN = 0;
  let reject = 0;
  let rejectN = 0;
  let brk = 0;
  let brkN = 0;
  const rvols: number[] = [];

  for (const t of touches) {
    rvols.push(t.rvol);
    const end = Math.min(candles.length - 1, t.i + horizon);
    if (end <= t.i) continue;
    const last = candles[end]!;
    if (t.fromAbove) {
      holdN += 1;
      brkN += 1;
      if (last.close >= t.level * 0.997) hold += 1;
      else brk += 1;
    } else {
      rejectN += 1;
      brkN += 1;
      if (last.close <= t.level * 1.003) reject += 1;
      else brk += 1;
    }
  }

  return {
    id: level.id,
    kind: level.kind,
    labelKo: level.labelKo,
    role: level.role,
    touches: touches.length,
    supportHoldPct: level.role !== 'resistance' ? pct(hold, holdN) : null,
    resistRejectPct: level.role !== 'support' ? pct(reject, rejectN) : null,
    breakPct: pct(brk, brkN),
    avgVolVsSma: rvols.length ? Math.round((median(rvols) || 0) * 100) / 100 : null,
    sampleOk: touches.length >= SAMPLE_TRUST_MIN,
  };
}

function buildVolumeRows(candles: Candle[], startI: number): VolumeRegimeRow[] {
  const vols = candles.map((c) => Number(c.volume) || 0);
  const rows: VolumeRegimeRow[] = [];

  const bucket = (
    id: string,
    labelKo: string,
    pred: (c: Candle, i: number, rvol: number) => boolean,
    noteKo: string
  ) => {
    const closePcts: number[] = [];
    let rvolSum = 0;
    let up = 0;
    let n = 0;
    for (let i = Math.max(startI, 20); i < candles.length; i++) {
      const c = candles[i]!;
      const smaV = smaAt(vols, i, 20);
      const rvol = smaV > 0 ? vols[i]! / smaV : 1;
      if (!pred(c, i, rvol)) continue;
      n += 1;
      rvolSum += rvol;
      const ch = ((c.close - c.open) / Math.max(c.open, 1e-9)) * 100;
      closePcts.push(ch);
      if (c.close >= c.open) up += 1;
    }
    rows.push({
      id,
      labelKo,
      sample: n,
      avgRvol: n ? Math.round((rvolSum / n) * 100) / 100 : 0,
      medianClosePct: median(closePcts),
      upSharePct: pct(up, n),
      noteKo,
    });
  };

  bucket('upBar', '양봉', (c) => c.close > c.open, '종가>시가');
  bucket('downBar', '음봉', (c) => c.close < c.open, '종가<시가');
  bucket('upHiVol', '양봉+고거래', (c, _i, r) => c.close > c.open && r >= 1.4, 'RVOL≥1.4');
  bucket('downHiVol', '음봉+고거래', (c, _i, r) => c.close < c.open && r >= 1.4, 'RVOL≥1.4');
  bucket('upLoVol', '양봉+저거래', (c, _i, r) => c.close > c.open && r <= 0.75, 'RVOL≤0.75');
  bucket('downLoVol', '음봉+저거래', (c, _i, r) => c.close < c.open && r <= 0.75, 'RVOL≤0.75');
  bucket(
    'rangeExpand',
    '몸통확대',
    (c, i) => {
      if (i < 1) return false;
      const prev = candles[i - 1]!;
      const body = Math.abs(c.close - c.open);
      const pbody = Math.abs(prev.close - prev.open);
      return pbody > 0 && body / pbody >= 1.6;
    },
    '직전 대비 몸통 1.6×'
  );

  return rows;
}

function buildSettleRows(candles: Candle[], startI: number, horizon: number): SettleSimRow[] {
  const rows: SettleSimRow[] = [];
  type Ev = { i: number; bias: 1 | -1 };
  const sealedLong: Ev[] = [];
  const sealedShort: Ev[] = [];
  const failLong: Ev[] = [];
  const failShort: Ev[] = [];

  for (let i = Math.max(startI, 2); i < candles.length - horizon - 1; i++) {
    const prev = candles[i - 1]!;
    const cur = candles[i]!;
    const bullPrev = prev.close > prev.open;
    const bearPrev = prev.close < prev.open;
    const above = cur.close > prev.close * 1.0005;
    const below = cur.close < prev.close * 0.9995;
    const holdHigh = cur.close >= prev.high * 0.999;
    const holdLow = cur.close <= prev.low * 1.001;

    if (bullPrev && above && cur.close >= (prev.high + prev.close) / 2) {
      sealedLong.push({ i, bias: 1 });
    }
    if (bearPrev && below && cur.close <= (prev.low + prev.close) / 2) {
      sealedShort.push({ i, bias: -1 });
    }
    if (bullPrev && below && cur.low < prev.low) {
      failLong.push({ i, bias: -1 });
    }
    if (bearPrev && above && cur.high > prev.high) {
      failShort.push({ i, bias: 1 });
    }
    if (holdHigh && above) sealedLong.push({ i, bias: 1 });
    if (holdLow && below) sealedShort.push({ i, bias: -1 });
  }

  const evalEv = (id: string, labelKo: string, evs: Ev[], noteKo: string): SettleSimRow => {
    let hit = 0;
    const rets: number[] = [];
    const uniq = new Map<number, Ev>();
    for (const e of evs) uniq.set(e.i, e);
    const list = [...uniq.values()];
    for (const e of list) {
      const a = candles[e.i]!.close;
      const b = candles[Math.min(candles.length - 1, e.i + horizon)]!.close;
      const ret = ((b - a) / a) * 100;
      rets.push(ret);
      if ((e.bias === 1 && ret > 0) || (e.bias === -1 && ret < 0)) hit += 1;
    }
    return {
      id,
      labelKo,
      sample: list.length,
      nextDirHitPct: pct(hit, list.length),
      medianNextPct: median(rets),
      sampleLowTrust: list.length < SAMPLE_TRUST_MIN,
      noteKo,
    };
  };

  rows.push(evalEv('sealLong', '상승마감·안착', sealedLong, `${horizon}봉 후 방향`));
  rows.push(evalEv('sealShort', '하락마감·안착', sealedShort, `${horizon}봉 후 방향`));
  rows.push(evalEv('failLong', '상승 실패(되돌림)', failLong, '실패 후 하방 여부'));
  rows.push(evalEv('failShort', '하락 실패(되돌림)', failShort, '실패 후 상방 여부'));
  return rows;
}

function buildBounceRows(
  candles: Candle[],
  levels: LevelSeries[],
  atr: number[],
  vols: number[],
  startI: number,
  horizon: number
): BounceSimRow[] {
  const rows: BounceSimRow[] = [];
  const supportLv = levels.filter((l) => l.role === 'support' || l.role === 'both');
  const resistLv = levels.filter((l) => l.role === 'resistance' || l.role === 'both');

  const run = (
    id: string,
    labelKo: string,
    list: LevelSeries[],
    mode: 'bounce' | 'reject'
  ): BounceSimRow => {
    let ok = 0;
    let n = 0;
    const mfe: number[] = [];
    const mae: number[] = [];
    for (const lv of list) {
      const touches = collectTouches(candles, lv.series, atr, vols, startI);
      for (const t of touches) {
        if (mode === 'bounce' && !t.fromAbove) continue;
        if (mode === 'reject' && t.fromAbove) continue;
        const end = Math.min(candles.length - 1, t.i + horizon);
        if (end <= t.i) continue;
        n += 1;
        const entry = candles[t.i]!.close;
        let best = 0;
        let worst = 0;
        for (let j = t.i + 1; j <= end; j++) {
          const ch = ((candles[j]!.close - entry) / entry) * 100;
          if (mode === 'bounce') {
            best = Math.max(best, ch);
            worst = Math.min(worst, ch);
          } else {
            best = Math.min(best, ch);
            worst = Math.max(worst, ch);
          }
        }
        mfe.push(mode === 'bounce' ? best : Math.abs(best));
        mae.push(mode === 'bounce' ? Math.abs(worst) : worst);
        if (mode === 'bounce' && best >= 0.15) ok += 1;
        if (mode === 'reject' && best <= -0.15) ok += 1;
      }
    }
    return {
      id,
      labelKo,
      sample: n,
      successPct: pct(ok, n),
      medianMfePct: median(mfe),
      medianMaePct: median(mae),
      noteKo: `${horizon}봉 관측 · 조건부`,
    };
  };

  rows.push(run('supBounce', '지지 터치→반등', supportLv, 'bounce'));
  rows.push(run('resReject', '저항 터치→거절', resistLv, 'reject'));
  return rows;
}

function buildSpotRows(
  candles: Candle[],
  levels: LevelSeries[],
  atr: number[],
  vols: number[],
  startI: number
): SpotSimRow[] {
  const rows: SpotSimRow[] = [];
  const ema20 = levels.find((l) => l.kind === 'ema20');
  const demand = levels.filter((l) => l.kind === 'zoneDemand' || l.kind === 'pivotLow');
  const supply = levels.filter((l) => l.kind === 'zoneSupply' || l.kind === 'pivotHigh');

  for (const h of HORIZONS) {
    const pushFrom = (
      id: string,
      labelKo: string,
      events: number[],
      bias: 1 | -1 | 0
    ) => {
      let up = 0;
      let down = 0;
      const rets: number[] = [];
      let tpSl = 0;
      let tpSlN = 0;
      for (const i of events) {
        if (i + h >= candles.length) continue;
        const a = candles[i]!.close;
        const b = candles[i + h]!.close;
        const ret = ((b - a) / a) * 100;
        rets.push(ret);
        if (ret > 0) up += 1;
        else if (ret < 0) down += 1;
        const risk = Math.max((atr[i] || a * 0.005) / a * 100, 0.12);
        let hitTp = false;
        let hitSl = false;
        for (let j = i + 1; j <= i + h; j++) {
          const ch = ((candles[j]!.close - a) / a) * 100;
          if (bias === 1) {
            if (ch >= risk * 1.5) hitTp = true;
            if (ch <= -risk) hitSl = true;
          } else if (bias === -1) {
            if (ch <= -risk * 1.5) hitTp = true;
            if (ch >= risk) hitSl = true;
          }
          if (hitTp || hitSl) break;
        }
        if (bias !== 0) {
          tpSlN += 1;
          if (hitTp && !hitSl) tpSl += 1;
        }
      }
      const sample = rets.length;
      rows.push({
        id: `${id}-h${h}`,
        labelKo: `${labelKo} · ${h}봉`,
        horizonBars: h,
        sample,
        upPct: pct(up, sample),
        downPct: pct(down, sample),
        medianPct: median(rets),
        hitTpBeforeSlPct: bias !== 0 ? pct(tpSl, tpSlN) : null,
        sampleLowTrust: sample < SAMPLE_TRUST_MIN,
        noteKo: '현물 종가 기준 시뮬 · 수수료/펀딩 미반영',
      });
    };

    const hiVolUp: number[] = [];
    const hiVolDown: number[] = [];
    for (let i = Math.max(startI, 20); i < candles.length - h; i++) {
      const c = candles[i]!;
      const smaV = smaAt(vols, i, 20);
      const rvol = smaV > 0 ? vols[i]! / smaV : 1;
      if (rvol < 1.35) continue;
      if (c.close > c.open) hiVolUp.push(i);
      if (c.close < c.open) hiVolDown.push(i);
    }
    pushFrom(`hivolUp`, '고거래 양봉 후', hiVolUp, 1);
    pushFrom(`hivolDn`, '고거래 음봉 후', hiVolDown, -1);

    if (ema20) {
      const reclaim: number[] = [];
      for (let i = Math.max(startI, 1); i < candles.length - h; i++) {
        const lv = ema20.series[i] || 0;
        if (!(lv > 0)) continue;
        const prev = candles[i - 1]!;
        const cur = candles[i]!;
        if (prev.close < lv && cur.close >= lv) reclaim.push(i);
      }
      pushFrom('emaReclaim', 'EMA20 재탈환', reclaim, 1);
    }

    const demTouches: number[] = [];
    for (const lv of demand) {
      for (const t of collectTouches(candles, lv.series, atr, vols, startI)) {
        if (t.fromAbove) demTouches.push(t.i);
      }
    }
    pushFrom('demTouch', '수요/저점 터치', demTouches, 1);

    const supTouches: number[] = [];
    for (const lv of supply) {
      for (const t of collectTouches(candles, lv.series, atr, vols, startI)) {
        if (!t.fromAbove) supTouches.push(t.i);
      }
    }
    pushFrom('supTouch', '공급/고점 터치', supTouches, -1);
  }

  return rows;
}

function buildCardRows(params: {
  analysis?: AnalyzeResponse | null;
  activeTrade?: MergedDeskActiveTradePlan | null;
  candleCard?: CandleCardConfluencePack | null;
  settleRow?: TfCloseSettleRow | null;
  close: number;
  hubVerdictKo?: string | null;
  hubHeadlineKo?: string | null;
}): CardAlignRow[] {
  const rows: CardAlignRow[] = [];
  const at = params.activeTrade;
  const cc = params.candleCard?.levels;
  const an = params.analysis;

  if (params.hubVerdictKo) {
    rows.push({
      id: 'hub',
      labelKo: '超级统计 Hub',
      valueKo: params.hubHeadlineKo || params.hubVerdictKo,
      tone: /확정|진입/i.test(params.hubVerdictKo)
        ? 'good'
        : /감시/i.test(params.hubVerdictKo)
          ? 'neutral'
          : 'warn',
    });
  }

  if (at && at.direction !== 'NEUTRAL') {
    const dirKo = at.direction === 'LONG' ? '롱' : '숏';
    rows.push({
      id: 'active',
      labelKo: 'ActiveTrade',
      valueKo: `${dirKo} · ${at.statusKo} · ${at.sourceKo} · E${at.entry.toFixed(0)}`,
      tone: at.status === 'ENTER' ? 'good' : at.status === 'INVALID' ? 'warn' : 'neutral',
    });
    rows.push({
      id: 'activeRr',
      labelKo: 'RR(TP1)',
      valueKo: at.rr > 0 ? `${at.rr.toFixed(2)}R` : '—',
      tone: at.rr >= 1.5 ? 'good' : at.rr >= 1 ? 'neutral' : 'warn',
    });
  } else {
    rows.push({
      id: 'active',
      labelKo: 'ActiveTrade',
      valueKo: '관망 / 플랜 없음',
      tone: 'neutral',
    });
  }

  if (cc) {
    const agree = cc.agreeScore;
    rows.push({
      id: 'candleCard',
      labelKo: '캔들·카드합류',
      valueKo: `${cc.direction === 'LONG' ? '롱' : '숏'} · 동의${agree} · ${cc.status}`,
      tone: agree >= 62 ? 'good' : agree >= 45 ? 'neutral' : 'warn',
    });
    if (at && at.direction !== 'NEUTRAL') {
      const same = at.direction === cc.direction;
      rows.push({
        id: 'align',
        labelKo: '카드↔Active 방향',
        valueKo: same ? '일치' : '불일치',
        tone: same ? 'good' : 'warn',
      });
    }
  }

  if (an) {
    const ls = Math.round(Number(an.longScore) || 0);
    const ss = Math.round(Number(an.shortScore) || 0);
    rows.push({
      id: 'analysis',
      labelKo: '캔들분석점수',
      valueKo: `L${ls} / S${ss} · ${an.verdict || '—'}`,
      tone: Math.abs(ls - ss) >= 12 ? 'good' : 'neutral',
    });
  }

  if (params.settleRow) {
    const r = params.settleRow;
    rows.push({
      id: 'settleLive',
      labelKo: `마감보드 ${r.tfKo}`,
      valueKo: `${r.formingVerdict} · ${r.confirmedEdge}${r.tailongTag ? ` · ${r.tailongTag}` : ''}`,
      tone:
        r.formingVerdict === '안착'
          ? 'good'
          : r.formingVerdict === '실패'
            ? 'warn'
            : 'neutral',
    });
  }

  if (at && at.entry > 0 && params.close > 0) {
    const dist = ((params.close - at.entry) / at.entry) * 100;
    const late =
      (at.direction === 'LONG' && dist > 0.45) || (at.direction === 'SHORT' && dist < -0.45);
    rows.push({
      id: 'late',
      labelKo: '진입가 대비',
      valueKo: `${fmtPct(dist)} ${late ? '· 늦은진입 주의' : '· 근접'}`,
      tone: late ? 'warn' : 'good',
    });
  }

  return rows;
}

function findLevelStat(
  levels: FeatureLevelRow[],
  pred: (r: FeatureLevelRow) => boolean
): FeatureLevelRow | null {
  return levels.find(pred) ?? null;
}

function levelStatKo(r: FeatureLevelRow | null): string | null {
  if (!r || r.touches <= 0) return null;
  const bits: string[] = [`터치${r.touches}`];
  if (r.supportHoldPct != null) bits.push(`지지${r.supportHoldPct}%`);
  if (r.resistRejectPct != null) bits.push(`저항${r.resistRejectPct}%`);
  if (r.breakPct != null) bits.push(`돌파${r.breakPct}%`);
  return bits.join(' · ');
}

function buildModeFeatureRows(params: {
  levels: FeatureLevelRow[];
  volume: VolumeRegimeRow[];
  settle: SettleSimRow[];
  bounce: BounceSimRow[];
  activeTrade?: MergedDeskActiveTradePlan | null;
  candleCard?: CandleCardConfluencePack | null;
  settleRow?: TfCloseSettleRow | null;
  hubVerdictKo?: string | null;
  overlayCount: number;
}): ModeFeatureRow[] {
  const L = params.levels;
  const rows: ModeFeatureRow[] = [];
  const push = (
    id: string,
    groupKo: string,
    labelKo: string,
    liveKo: string,
    stat: FeatureLevelRow | null | string,
    linked: boolean,
    tone: ModeFeatureRow['tone'] = 'neutral'
  ) => {
    rows.push({
      id,
      groupKo,
      labelKo,
      liveKo,
      statKo: typeof stat === 'string' ? stat : levelStatKo(stat),
      linked,
      tone,
    });
  };

  push('ema20', '추세선', 'EMA20', '차트 동적선', findLevelStat(L, (r) => r.kind === 'ema20'), true);
  push('ema50', '추세선', 'EMA50', '차트 동적선', findLevelStat(L, (r) => r.kind === 'ema50'), true, 'good');
  push('ema200', '추세선', 'EMA200', '차트 동적선', findLevelStat(L, (r) => r.kind === 'ema200'), true);
  push('swingLo', '구조', '스윙저점', '피벗 지지', findLevelStat(L, (r) => r.kind === 'pivotLow'), true, 'good');
  push('swingHi', '구조', '스윙고점', '피벗 저항', findLevelStat(L, (r) => r.kind === 'pivotHigh'), true);
  push('hot', '존', 'HotZone', params.overlayCount ? '오버레이 합류' : '대기', findLevelStat(L, (r) => r.kind === 'hotZone'), true);
  push('hq', '존', 'HQ진입', '데스크 HQ', findLevelStat(L, (r) => r.kind === 'hqEntry'), true);
  push('avwap', 'VWAP', 'AVWAP', '앵커 VWAP', findLevelStat(L, (r) => r.kind === 'avwap'), true);
  push('st', '기관', '기관ST밴드', '터치존', findLevelStat(L, (r) => r.kind === 'stBand'), true);
  push('msb', 'SMC', 'MSB·구조', '돌파/존', findLevelStat(L, (r) => r.kind === 'msb'), true);
  push('ch', '채널', '청적채널', '파랑·빨강띠', findLevelStat(L, (r) => r.kind === 'channel'), true);
  push('sd', '존', '공급·수요존', 'S/D', findLevelStat(L, (r) => r.kind === 'zoneSupply' || r.kind === 'zoneDemand'), true);
  push('poc', '거래량', 'POC/VRVP', '프로파일', findLevelStat(L, (r) => r.kind === 'poc'), true);

  const hiVol = params.volume.find((v) => v.id === 'upHiVol');
  push(
    'vol',
    '거래량',
    '고거래 양·음봉',
    hiVol ? `양봉 RVOL ${hiVol.avgRvol.toFixed(2)}×` : '집계',
    hiVol ? `n=${hiVol.sample} · 중앙 ${hiVol.medianClosePct?.toFixed(2) ?? '—'}%` : null,
    true,
    'good'
  );

  const seal = params.settle.find((s) => s.id === 'sealLong');
  push(
    'settle',
    '마감',
    '종가안착 시뮬',
    params.settleRow ? `${params.settleRow.tfKo} ${params.settleRow.formingVerdict}` : '보드 연동',
    seal ? `상승적중 ${seal.nextDirHitPct ?? '—'}% (n=${seal.sample})` : null,
    true,
    'good'
  );

  const bounce = params.bounce[0];
  push(
    'bounce',
    '반등',
    '지지반등·저항거절',
    '터치 후 MFE',
    bounce ? `성공 ${bounce.successPct ?? '—'}% (n=${bounce.sample})` : null,
    true
  );

  const at = params.activeTrade;
  push(
    'active',
    '카드',
    'ActiveTrade E/SL/TP',
    at && at.direction !== 'NEUTRAL'
      ? `${at.direction === 'LONG' ? '롱' : '숏'} ${at.statusKo} · ${at.sourceKo}`
      : '관망',
    findLevelStat(L, (r) => r.kind === 'activeEntry'),
    true,
    at?.status === 'ENTER' ? 'good' : 'neutral'
  );

  push(
    'hub',
    '카드',
    '超级统计 Hub',
    params.hubVerdictKo || '미연결',
    params.hubVerdictKo,
    !!params.hubVerdictKo,
    params.hubVerdictKo ? 'good' : 'warn'
  );

  const cc = params.candleCard;
  push(
    'cc',
    '카드',
    '캔들·카드합류',
    cc?.linked && cc.levels ? `${cc.levels.direction} 동의${cc.levels.agreeScore}` : '대기',
    cc?.summaryKo ?? null,
    !!cc?.linked
  );

  push('spot', '시뮬', '현물 N봉 시뮬', '3/8/21봉', '아래 현물시뮬 표 참고', true);
  return rows;
}

function buildExtraRows(
  candles: Candle[],
  startI: number,
  atr: number[]
): ExtraStatRow[] {
  const n = candles.length;
  let upStreak = 0;
  let dnStreak = 0;
  let curUp = 0;
  let curDn = 0;
  for (let i = startI; i < n; i++) {
    const c = candles[i]!;
    if (c.close >= c.open) {
      curUp += 1;
      curDn = 0;
    } else {
      curDn += 1;
      curUp = 0;
    }
    upStreak = Math.max(upStreak, curUp);
    dnStreak = Math.max(dnStreak, curDn);
  }

  const last = candles[n - 1]!;
  const atrLast = atr[n - 1] || 0;
  const atrPct = last.close > 0 && atrLast > 0 ? (atrLast / last.close) * 100 : null;

  let rangeBars = 0;
  for (let i = Math.max(startI, n - 40); i < n; i++) {
    const c = candles[i]!;
    const body = Math.abs(c.close - c.open);
    const rng = c.high - c.low;
    if (rng > 0 && body / rng < 0.35) rangeBars += 1;
  }

  const vols = candles.map((c) => Number(c.volume) || 0);
  const lastRvol =
    n > 20 ? vols[n - 1]! / Math.max(smaAt(vols, n - 1, 20), 1e-9) : null;

  return [
    {
      id: 'streak',
      labelKo: '최대 연속',
      valueKo: `양봉 ${upStreak} · 음봉 ${dnStreak}`,
      noteKo: '조회 구간',
    },
    {
      id: 'atr',
      labelKo: 'ATR%',
      valueKo: atrPct != null ? `${atrPct.toFixed(2)}%` : '—',
      noteKo: '변동성 참고',
    },
    {
      id: 'dojiish',
      labelKo: '최근 중립봉 비중',
      valueKo: `${rangeBars}/40`,
      noteKo: '몸통/범위 <35%',
    },
    {
      id: 'rvolNow',
      labelKo: '현재 RVOL',
      valueKo: lastRvol != null ? `${lastRvol.toFixed(2)}×` : '—',
      noteKo: '20봉 대비',
    },
    {
      id: 'sample',
      labelKo: '분석봉',
      valueKo: `${n - startI}봉`,
      noteKo: '시뮬 구간',
    },
  ];
}

function liveSettleRow(
  board: TfCloseSettleBoard | null | undefined,
  timeframe: string
): TfCloseSettleRow | null {
  const tf = chartTfToCloseSettleTf(timeframe);
  if (!tf || !board?.rows?.length) return null;
  return board.rows.find((r) => r.tf === tf) ?? null;
}

/**
 * 통합 통계 팩 — 캔들 필수, 오버레이/Active/합류/마감보드는 있으면 보강.
 * EMA·스윙·존 수치는 현재 TF 캔들 백테스트(조건부) — 확정 승률 아님.
 */
export function buildMergedDeskFeatureStatsPack(params: {
  candles: Candle[];
  timeframe: string;
  symbol?: string;
  analysis?: AnalyzeResponse | null;
  overlays?: OverlayItem[] | null;
  activeTrade?: MergedDeskActiveTradePlan | null;
  candleCard?: CandleCardConfluencePack | null;
  settleBoard?: TfCloseSettleBoard | null;
  hubVerdictKo?: string | null;
  hubHeadlineKo?: string | null;
  lookback?: number;
}): MergedDeskFeatureStatsPack | null {
  const raw = params.candles;
  if (raw.length < 48) return null;
  const lookback = Math.min(params.lookback ?? 280, raw.length);
  const candles = raw.slice(-lookback);
  const n = candles.length;
  const startI = Math.max(24, Math.floor(n * 0.12));
  const atr = atrSeries(candles, 14);
  const vols = candles.map((c) => Number(c.volume) || 0);
  const levels = buildLevelSeries(candles, params.overlays, params.activeTrade);
  const horizon = Math.max(4, Math.min(12, Math.round(n * 0.03)));

  const levelRows = levels
    .map((lv) => scoreLevel(candles, lv, atr, vols, startI, horizon))
    .filter((r) => r.touches > 0)
    .sort((a, b) => b.touches - a.touches);

  const volume = buildVolumeRows(candles, startI);
  const settle = buildSettleRows(candles, startI, horizon);
  const bounce = buildBounceRows(candles, levels, atr, vols, startI, horizon);
  const spot = buildSpotRows(candles, levels, atr, vols, startI);
  const settleLive = liveSettleRow(params.settleBoard, params.timeframe);
  const close = candles[n - 1]!.close;
  const card = buildCardRows({
    analysis: params.analysis,
    activeTrade: params.activeTrade,
    candleCard: params.candleCard,
    settleRow: settleLive,
    close,
    hubVerdictKo: params.hubVerdictKo,
    hubHeadlineKo: params.hubHeadlineKo,
  });
  const extra = buildExtraRows(candles, startI, atr);
  const modeFeatures = buildModeFeatureRows({
    levels: levelRows,
    volume,
    settle,
    bounce,
    activeTrade: params.activeTrade,
    candleCard: params.candleCard,
    settleRow: settleLive,
    hubVerdictKo: params.hubVerdictKo,
    overlayCount: params.overlays?.length ?? 0,
  });

  const bestSup = [...levelRows]
    .filter((r) => r.supportHoldPct != null && r.touches >= 5)
    .sort((a, b) => (b.supportHoldPct || 0) - (a.supportHoldPct || 0))[0];
  const bestRes = [...levelRows]
    .filter((r) => r.resistRejectPct != null && r.touches >= 5)
    .sort((a, b) => (b.resistRejectPct || 0) - (a.resistRejectPct || 0))[0];

  const hiVolUp = volume.find((v) => v.id === 'upHiVol');
  const hiVolDn = volume.find((v) => v.id === 'downHiVol');
  let volBiasKo: string | null = null;
  if (hiVolUp && hiVolDn && hiVolUp.sample + hiVolDn.sample >= 8) {
    const upMed = hiVolUp.medianClosePct ?? 0;
    const dnMed = hiVolDn.medianClosePct ?? 0;
    volBiasKo =
      Math.abs(upMed) >= Math.abs(dnMed)
        ? `고거래 양봉 중앙 ${fmtPct(upMed)}`
        : `고거래 음봉 중앙 ${fmtPct(dnMed)}`;
  }

  const sealL = settle.find((s) => s.id === 'sealLong');
  const sealS = settle.find((s) => s.id === 'sealShort');
  let settleBiasKo: string | null = null;
  if (sealL?.nextDirHitPct != null || sealS?.nextDirHitPct != null) {
    const l = sealL?.nextDirHitPct ?? 0;
    const s = sealS?.nextDirHitPct ?? 0;
    settleBiasKo =
      l >= s
        ? `상승안착 방향적중 ${l}% (n=${sealL?.sample ?? 0})`
        : `하락안착 방향적중 ${s}% (n=${sealS?.sample ?? 0})`;
  }

  const overviewKo: string[] = [];
  overviewKo.push(`백테스트 ${lookback}봉 · ${params.timeframe} — 아래 칩 구간이 전부 이어짐`);
  if (bestSup) {
    overviewKo.push(
      `지지 강함: ${bestSup.labelKo} 유지 ${bestSup.supportHoldPct}% (터치 ${bestSup.touches})`
    );
  }
  if (bestRes) {
    overviewKo.push(
      `저항 강함: ${bestRes.labelKo} 거절 ${bestRes.resistRejectPct}% (터치 ${bestRes.touches})`
    );
  }
  if (volBiasKo) overviewKo.push(`거래량: ${volBiasKo}`);
  if (settleBiasKo) overviewKo.push(`안착: ${settleBiasKo}`);
  if (params.hubVerdictKo) {
    overviewKo.push(`Hub: ${params.hubVerdictKo}`);
  }
  if (params.activeTrade && params.activeTrade.direction !== 'NEUTRAL') {
    const dirKo = params.activeTrade.direction === 'LONG' ? '롱' : '숏';
    overviewKo.push(
      `Active: ${dirKo} ${params.activeTrade.statusKo} · 소스 ${params.activeTrade.sourceKo}`
    );
  }
  if (!bestSup && !bestRes) overviewKo.push('표본 부족 — TF·봉 수 늘려 재시도');

  return {
    symbol: params.symbol || '',
    timeframe: params.timeframe,
    barCount: raw.length,
    lookback,
    builtAtIso: new Date().toISOString(),
    disclaimerKo:
      '통합모드 기능 맵 + 캔들 백테스트입니다. EMA50·스윙·존 숫자는 조건부 표본 비율 — 확정 승률·수익 보장 아님.',
    overviewKo,
    modeFeatures,
    levels: levelRows,
    volume,
    settle,
    bounce,
    spot,
    card,
    extra,
    headline: {
      bestSupportKo: bestSup
        ? `${bestSup.labelKo} ${bestSup.supportHoldPct}%`
        : null,
      bestResistKo: bestRes
        ? `${bestRes.labelKo} ${bestRes.resistRejectPct}%`
        : null,
      volBiasKo,
      settleBiasKo,
    },
  };
}

export function formatFeatureStatsPct(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return `${n.toFixed(1)}%`;
}
