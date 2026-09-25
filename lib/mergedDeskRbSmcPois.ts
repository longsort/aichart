/**
 * 超级파랑빨강띠 · 돈되는자리 (MSB · OB · BB · MB)
 *
 * 이미지 설계 고정:
 * - 상승: 롱통로 안 + 아래 MB/OB 터치 → 위 채널상·다음저항 측정
 * - 하락: 숏통로 안 + 위 BE-BB/MB 터치 → 아래 채널하·다음지지 측정
 * - 상위 TF MSB 방향 같음 → 진하게 / 충돌 → WAIT(연함)
 *
 * 표시: **zone 면 + 가로선** (축 숫자 알약·영문 Break 라벨 금지).
 * 확정 수익·승률 아님. 채널 기하·SMC OB·HTF 캔들만 사용.
 */
import type { Candle, OverlayItem } from '@/types';
import type { UTCTimestamp } from 'lightweight-charts';
import {
  TIMEFRAME_ORDER,
  normalizeChartTimeframe,
} from '@/lib/constants';
import {
  detectSmcStructureOrderBlocks,
  isObBrokenByClose,
  isObMitigated,
  type SmcObHit,
} from '@/lib/smcStructureOrderBlocks';
import type { MergedDeskChannelGeom } from '@/lib/mergedDeskBlueRedChannels';
import { loadSettings } from '@/lib/settings';
import { mergedDesk4hReferencePivotWindowForTf } from '@/lib/mergedDesk4hReference';

export type RbSmcPoiKind = 'MSB' | 'OB' | 'BB' | 'MB';
export type RbMoneySpotSide = 'LONG' | 'SHORT' | 'WAIT';

export type MergedDeskRbSmcPoi = {
  kind: RbSmcPoiKind;
  bias: 'bullish' | 'bearish';
  low: number;
  high: number;
  mid: number;
  index: number;
  time1: number;
  time2: number;
  priority: number;
  labelKo: string;
  inChannel: boolean;
  touchActive: boolean;
  dropPct: number | null;
  risePct: number | null;
  targetPrice: number | null;
};

export type MergedDeskRbMoneySpotPlan = {
  side: RbMoneySpotSide;
  phaseKo: string;
  entryZone: { low: number; high: number; kind: 'MB' | 'OB' | 'BB'; labelKo: string } | null;
  targetPrice: number | null;
  targetKo: string;
  dropPct: number | null;
  risePct: number | null;
  msbBias: 'bullish' | 'bearish' | null;
  htfMsbBias: 'bullish' | 'bearish' | null;
  htfAligned: boolean;
  bold: boolean;
  waitConflict: boolean;
  summaryKo: string;
  detailKo: string;
};

export type MergedDeskRbSmcPoisPack = {
  enabled: boolean;
  chartTf: string;
  htfTf: string | null;
  money: MergedDeskRbMoneySpotPlan | null;
  pois: MergedDeskRbSmcPoi[];
  overlays: OverlayItem[];
  priceLines: Array<{
    price: number;
    color: string;
    title: string;
    lineWidth: 1 | 2 | 3 | 4;
    lineStyle: 'solid' | 'dotted' | 'dashed';
    axisLabel: boolean;
  }>;
  summaryKo: string;
};

/** 차트 TF → 상위 1단 TF (15m→1h, 1h→4h, 4h→1d …) */
export function resolveRbSmcHtfTf(chartTf: string): string | null {
  const tf = normalizeChartTimeframe(chartTf) || chartTf;
  const i = TIMEFRAME_ORDER.indexOf(tf as (typeof TIMEFRAME_ORDER)[number]);
  if (i < 0 || i >= TIMEFRAME_ORDER.length - 1) return null;
  const next = TIMEFRAME_ORDER[i + 1];
  return next ?? null;
}

function pivotHigh(c: Candle[], i: number, L: number, R: number): boolean {
  if (i - L < 0 || i + R >= c.length) return false;
  const v = c[i]!.high;
  for (let j = i - L; j <= i + R; j++) {
    if (j !== i && c[j]!.high >= v) return false;
  }
  return true;
}

function pivotLow(c: Candle[], i: number, L: number, R: number): boolean {
  if (i - L < 0 || i + R >= c.length) return false;
  const v = c[i]!.low;
  for (let j = i - L; j <= i + R; j++) {
    if (j !== i && c[j]!.low <= v) return false;
  }
  return true;
}

export function detectRecentMsb(
  candles: Candle[],
  timeframe?: string
): { bias: 'bullish' | 'bearish'; index: number; price: number } | null {
  const n = candles.length;
  if (n < 16) return null;
  const { L, R } = mergedDesk4hReferencePivotWindowForTf(timeframe || '1h');
  const left = Math.max(1, L);
  const right = Math.max(1, R);
  const swings: Array<{ type: 'high' | 'low'; index: number; price: number }> = [];
  for (let i = left; i < n - right; i++) {
    if (pivotHigh(candles, i, left, right))
      swings.push({ type: 'high', index: i, price: candles[i]!.high });
    if (pivotLow(candles, i, left, right))
      swings.push({ type: 'low', index: i, price: candles[i]!.low });
  }
  swings.sort((a, b) => a.index - b.index);
  let trend: 'bullish' | 'bearish' | 'range' = 'range';
  let last: { bias: 'bullish' | 'bearish'; index: number; price: number } | null = null;
  for (let i = 2; i < swings.length; i++) {
    const a = swings[i - 2]!;
    const c = swings[i]!;
    if (c.type === 'high' && a.type === 'high' && c.price > a.price) {
      if (trend === 'bearish') last = { bias: 'bullish', index: c.index, price: c.price };
      trend = 'bullish';
    }
    if (c.type === 'low' && a.type === 'low' && c.price < a.price) {
      if (trend === 'bullish') last = { bias: 'bearish', index: c.index, price: c.price };
      trend = 'bearish';
    }
  }
  return last;
}

function primaryGeom(geoms: MergedDeskChannelGeom[]): MergedDeskChannelGeom | null {
  return geoms.find((g) => g.primary) ?? geoms[0] ?? null;
}

/** 롱통로=상승채널(비내림) · 숏통로=하락채널 */
function corridorSide(g: MergedDeskChannelGeom | null): RbMoneySpotSide {
  if (!g || !(g.tipUpper > g.tipLower)) return 'WAIT';
  if (Math.abs(g.slopePct) < 0.0028) return 'WAIT';
  return g.descending || g.useBearFill ? 'SHORT' : 'LONG';
}

function priceInCorridor(price: number, g: MergedDeskChannelGeom, atr: number): boolean {
  const pad = Math.max(atr * 0.15, g.width * 0.08);
  return price >= g.tipLower - pad && price <= g.tipUpper + pad;
}

function nearChannelEdge(
  mid: number,
  g: MergedDeskChannelGeom,
  side: 'lower' | 'upper',
  atr: number
): boolean {
  const band = Math.max(atr * 0.45, g.width * 0.22);
  if (side === 'lower') return Math.abs(mid - g.tipLower) <= band || (mid >= g.tipLower - band && mid <= g.tipMid);
  return Math.abs(mid - g.tipUpper) <= band || (mid <= g.tipUpper + band && mid >= g.tipMid);
}

/** 최근 N봉이 존을 터치했는지 */
function zoneTouchedRecently(
  candles: Candle[],
  low: number,
  high: number,
  lookback = 5
): boolean {
  const n = candles.length;
  const from = Math.max(0, n - lookback);
  for (let i = from; i < n; i++) {
    const c = candles[i]!;
    if (c.low <= high && c.high >= low) return true;
  }
  return false;
}

function classifyOb(ob: SmcObHit, candles: Candle[]): 'OB' | 'BB' | 'MB' {
  if (isObBrokenByClose(ob, candles)) return 'BB';
  if (isObMitigated(ob, candles)) return 'MB';
  return 'OB';
}

function kindMeta(
  kind: RbSmcPoiKind,
  bias: 'bullish' | 'bearish',
  bold: boolean
): { priority: number; labelKo: string; color: string; stroke: string } {
  const a = bold ? 1 : 0.42;
  const bull = bias === 'bullish';
  if (kind === 'MB') {
    return {
      priority: 1,
      labelKo: bull ? 'MB/OB 터치' : 'BE-BB/MB 터치',
      color: bull
        ? `rgba(34,211,238,${(0.42 * a).toFixed(3)})`
        : `rgba(251,146,60,${(0.4 * a).toFixed(3)})`,
      stroke: bold ? (bull ? '#22D3EE' : '#FB923C') : 'rgba(148,163,184,0.55)',
    };
  }
  if (kind === 'OB') {
    return {
      priority: 2,
      labelKo: bull ? 'OB·롱구간' : 'OB·숏구간',
      color: bull
        ? `rgba(16,185,129,${(0.32 * a).toFixed(3)})`
        : `rgba(244,63,94,${(0.3 * a).toFixed(3)})`,
      stroke: bold ? (bull ? '#10B981' : '#F43F5E') : 'rgba(148,163,184,0.5)',
    };
  }
  if (kind === 'BB') {
    return {
      priority: 3,
      labelKo: bull ? 'BE-BB·저항' : 'BB·지지전환',
      color: bull
        ? `rgba(248,113,113,${(0.28 * a).toFixed(3)})`
        : `rgba(74,222,128,${(0.28 * a).toFixed(3)})`,
      stroke: bold ? (bull ? '#F87171' : '#4ADE80') : 'rgba(148,163,184,0.5)',
    };
  }
  return {
    priority: 0,
    labelKo: bull ? 'MSB↑' : 'MSB↓',
    color: `rgba(250,204,21,${(0.2 * a).toFixed(3)})`,
    stroke: bold ? '#FACC15' : 'rgba(148,163,184,0.55)',
  };
}

function fmtPx(n: number): string {
  if (!Number.isFinite(n)) return '—';
  return n >= 1000 ? n.toFixed(0) : n >= 1 ? n.toFixed(1) : n.toFixed(3);
}

function fmtPct(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return `${n.toFixed(2)}%`;
}

/**
 * 超级 돈되는자리 팩 — TF별 + HTF MSB 정렬.
 */
export function buildMergedDeskRbSmcPoisPack(params: {
  candles: Candle[];
  timeframe: string;
  geoms?: MergedDeskChannelGeom[] | null;
  htfCandles?: Candle[] | null;
  htfTf?: string | null;
  enabled?: boolean;
}): MergedDeskRbSmcPoisPack {
  const chartTf = normalizeChartTimeframe(params.timeframe) || params.timeframe;
  const htfTf = params.htfTf || resolveRbSmcHtfTf(chartTf);
  const empty: MergedDeskRbSmcPoisPack = {
    enabled: false,
    chartTf,
    htfTf,
    money: null,
    pois: [],
    overlays: [],
    priceLines: [],
    summaryKo: '超级채널SMC 대기',
  };

  let enabled = params.enabled;
  if (enabled == null) {
    try {
      enabled = loadSettings().chartMergedDeskRbSmcPoisEnabled !== false;
    } catch {
      enabled = true;
    }
  }
  if (!enabled) return empty;

  const candles = params.candles;
  const n = candles.length;
  if (n < 24) {
    return { ...empty, enabled: true, summaryKo: `${chartTf} 봉 부족` };
  }

  const { obs, atrVal } = detectSmcStructureOrderBlocks(candles);
  const g = primaryGeom(params.geoms ?? []);
  const corridor = corridorSide(g);
  const tLast = Number(candles[n - 1]?.time) || 0;
  const close = Number(candles[n - 1]?.close) || 0;
  if (!(tLast > 0) || !(close > 0) || !g) {
    return { ...empty, enabled: true, summaryKo: '채널 기하 없음' };
  }

  const msb = detectRecentMsb(candles, chartTf);
  const htfMsb =
    params.htfCandles && params.htfCandles.length >= 24
      ? detectRecentMsb(params.htfCandles, htfTf || '4h')
      : null;

  const htfAligned =
    !htfMsb || !msb
      ? true
      : htfMsb.bias === msb.bias ||
        (corridor === 'LONG' && htfMsb.bias === 'bullish') ||
        (corridor === 'SHORT' && htfMsb.bias === 'bearish');

  const waitConflict =
    !!htfMsb &&
    ((corridor === 'LONG' && htfMsb.bias === 'bearish') ||
      (corridor === 'SHORT' && htfMsb.bias === 'bullish') ||
      (!!msb && htfMsb.bias !== msb.bias && corridor !== 'WAIT'));

  const bold = !waitConflict && htfAligned && corridor !== 'WAIT';

  /** 시나리오별 후보 OB */
  type Cand = MergedDeskRbSmcPoi & { rawKind: 'OB' | 'BB' | 'MB' };
  const cands: Cand[] = [];

  for (const ob of [...obs].sort((a, b) => b.index - a.index).slice(0, 14)) {
    const rawKind = classifyOb(ob, candles);
    const mid = (ob.low + ob.high) / 2;
    if (!priceInCorridor(mid, g, atrVal) && !priceInCorridor(ob.low, g, atrVal) && !priceInCorridor(ob.high, g, atrVal)) {
      continue;
    }

    /** 롱: 하단 MB/OB · 숏: 상단 BE-BB/MB */
    if (corridor === 'LONG') {
      if (ob.bias !== 'bullish') continue;
      if (rawKind === 'BB') continue;
      if (!nearChannelEdge(mid, g, 'lower', atrVal)) continue;
    } else if (corridor === 'SHORT') {
      if (rawKind === 'OB' && ob.bias === 'bullish') continue;
      /** BE-BB: 깨진 롱OB(저항) 또는 숏 MB */
      if (rawKind === 'BB' && ob.bias !== 'bullish') continue;
      if (rawKind === 'OB' && ob.bias === 'bearish' && !nearChannelEdge(mid, g, 'upper', atrVal)) continue;
      if (rawKind === 'MB' && ob.bias === 'bearish' && !nearChannelEdge(mid, g, 'upper', atrVal)) continue;
      if (rawKind === 'BB' && !nearChannelEdge(mid, g, 'upper', atrVal)) continue;
      if (rawKind === 'MB' && ob.bias === 'bullish') continue;
    } else {
      continue;
    }

    const touchActive = zoneTouchedRecently(candles, ob.low, ob.high, 6);
    const meta = kindMeta(rawKind === 'MB' ? 'MB' : rawKind === 'BB' ? 'BB' : 'OB', ob.bias, bold);
    const t1 = Number(candles[ob.index]?.time) || tLast;

    let dropPct: number | null = null;
    let risePct: number | null = null;
    let targetPrice: number | null = null;

    if (corridor === 'LONG') {
      targetPrice = g.tipUpper;
      const swingRef = msb?.price ?? g.tipMid;
      const drop = Math.max(0, swingRef - ob.high);
      const rise = Math.max(0, targetPrice - mid);
      dropPct = (drop / close) * 100;
      risePct = (rise / close) * 100;
    } else if (corridor === 'SHORT') {
      targetPrice = g.tipLower;
      const swingRef = msb?.price ?? g.tipMid;
      const up = Math.max(0, ob.low - Math.min(swingRef, close));
      const down = Math.max(0, mid - targetPrice);
      dropPct = (down / close) * 100;
      risePct = (up / close) * 100;
    }

    cands.push({
      kind: rawKind,
      rawKind,
      bias: ob.bias,
      low: ob.low,
      high: ob.high,
      mid,
      index: ob.index,
      time1: t1,
      time2: tLast,
      priority: meta.priority,
      labelKo: meta.labelKo,
      inChannel: true,
      touchActive,
      dropPct,
      risePct,
      targetPrice,
    });
  }

  /** MB > 터치OB > OB > BB · 터치 가산 */
  cands.sort((a, b) => {
    const ta = (a.touchActive ? 0 : 10) + a.priority;
    const tb = (b.touchActive ? 0 : 10) + b.priority;
    return ta - tb || b.index - a.index;
  });

  const entry = cands[0] ?? null;
  const pois: MergedDeskRbSmcPoi[] = [];

  if (msb) {
    const c = candles[msb.index]!;
    const meta = kindMeta('MSB', msb.bias, bold);
    pois.push({
      kind: 'MSB',
      bias: msb.bias,
      low: Math.min(c.low, msb.price),
      high: Math.max(c.high, msb.price),
      mid: msb.price,
      index: msb.index,
      time1: Number(c.time),
      time2: tLast,
      priority: 0,
      labelKo: meta.labelKo,
      inChannel: priceInCorridor(msb.price, g, atrVal),
      touchActive: false,
      dropPct: null,
      risePct: null,
      targetPrice: null,
    });
  }

  if (entry) {
    pois.push(entry);
    /** 보조: 반대 품질 1개만 연하게(비터치) */
    const second = cands.find((x) => x.index !== entry.index && x.rawKind !== entry.rawKind);
    if (second && bold) {
      pois.push({ ...second, touchActive: false });
    }
  }

  const moneySide: RbMoneySpotSide = waitConflict
    ? 'WAIT'
    : entry && entry.touchActive
      ? corridor
      : corridor === 'WAIT'
        ? 'WAIT'
        : entry
          ? corridor
          : 'WAIT';

  const money: MergedDeskRbMoneySpotPlan = {
    side: moneySide,
    phaseKo: waitConflict
      ? '상위역방향대기'
      : entry?.touchActive
        ? corridor === 'LONG'
          ? '롱통로·하단터치'
          : '숏통로·상단터치'
        : entry
          ? '존대기·접근'
          : '채널SMC대기',
    entryZone: entry
      ? {
          low: entry.low,
          high: entry.high,
          kind: entry.rawKind,
          labelKo: entry.labelKo,
        }
      : null,
    targetPrice: entry?.targetPrice ?? (corridor === 'LONG' ? g.tipUpper : corridor === 'SHORT' ? g.tipLower : null),
    targetKo:
      corridor === 'LONG'
        ? '채널상 · 다음저항'
        : corridor === 'SHORT'
          ? '채널하 · 다음지지'
          : '—',
    dropPct: entry?.dropPct ?? null,
    risePct: entry?.risePct ?? null,
    msbBias: msb?.bias ?? null,
    htfMsbBias: htfMsb?.bias ?? null,
    htfAligned: !waitConflict,
    bold,
    waitConflict,
    summaryKo: waitConflict
      ? `WAIT · 상위${htfTf || ''} MSB 충돌`
      : entry
        ? `${corridor === 'LONG' ? '롱통로' : '숏통로'} · ${entry.labelKo}${entry.touchActive ? '·터치' : ''} → ${corridor === 'LONG' ? '채널상' : '채널하'}`
        : `${chartTf} 超级채널 · POI 대기`,
    detailKo: [
      `차트 ${chartTf}`,
      htfTf ? `상위 ${htfTf}${htfMsb ? (htfMsb.bias === 'bullish' ? ' MSB↑' : ' MSB↓') : ''}` : '',
      entry
        ? `↓${fmtPct(entry.dropPct)} ↑${fmtPct(entry.risePct)}`
        : '',
      '참고·확정수익 아님',
    ]
      .filter(Boolean)
      .join(' · '),
  };

  const overlays: OverlayItem[] = [];
  const priceLines: MergedDeskRbSmcPoisPack['priceLines'] = [];
  const dim = waitConflict || !bold;

  for (const p of pois) {
    const meta = kindMeta(p.kind, p.bias, bold && (p.kind === 'MSB' || p.touchActive || p === entry));
    const id = `merged-desk-rb-smc-${p.kind.toLowerCase()}-${p.bias}-${p.index}`;
    const half = Math.max(atrVal * 0.14, Math.abs(p.mid) * 0.0004, Math.abs(p.high - p.low) * 0.15 || 0);

    if (p.kind === 'MSB') {
      /** 숫자 축알약 금지 — 구조돌파 zone 면 + 가격선(라벨 없음) */
      const face = p.bias === 'bullish' ? `구조돌파 MSB↑` : `구조돌파 MSB↓`;
      const faceTf = htfTf ? `${face} · ${chartTf}` : face;
      const tip = [
        faceTf,
        p.bias === 'bullish' ? '상승 구조 돌파(MSB) 구간' : '하락 구조 돌파(MSB) 구간',
        money.detailKo,
        '축 숫자 라벨 아님 · zone·가로선으로 표시 · 확정 아님',
      ]
        .filter(Boolean)
        .join('\n');
      overlays.push({
        id,
        kind: p.bias === 'bullish' ? 'demandZone' : 'supplyZone',
        label: faceTf,
        x1: 0,
        y1: 0,
        x2: 1,
        y2: 1,
        time1: p.time1 as UTCTimestamp,
        time2: tLast as UTCTimestamp,
        price1: p.mid + half,
        price2: p.mid - half,
        priceFrozen1: p.mid + half,
        priceFrozen2: p.mid - half,
        color: p.bias === 'bullish' ? 'rgba(250,204,21,0.28)' : 'rgba(251,113,133,0.30)',
        confidence: bold ? 80 : 45,
        category: 'structure',
        structureBias: p.bias,
        zoneFillPreserve: true,
        overlayZoneExtraClass:
          'merged-desk-rb-smc merged-desk-rb-smc-msb merged-desk-zone-label-on merged-desk-rb-channel merged-desk-zone-pro-hero merged-desk-money-zone-keep',
        zoneFaceBase: faceTf,
        zoneFaceSignal: p.bias === 'bullish' ? '상방 돌파' : '하방 돌파',
        zoneFaceDetailKo: tip,
        labelTooltip: tip,
        labelBackgroundColor: p.bias === 'bullish' ? 'rgba(250,204,21,0.28)' : 'rgba(251,113,133,0.30)',
        labelTextColor: '#f8fafc',
        noProject: true,
      });
      /** 형성봉 세로 레일(노랑) — 글자 알약 아님 */
      overlays.push({
        id: `${id}-span`,
        kind: 'trendLine',
        label: '',
        x1: 0,
        y1: 0,
        x2: 1,
        y2: 1,
        time1: p.time1 as UTCTimestamp,
        time2: p.time1 as UTCTimestamp,
        price1: g.tipLower,
        price2: g.tipUpper,
        color: dim ? 'rgba(250,204,21,0.25)' : 'rgba(250,204,21,0.55)',
        confidence: 60,
        category: 'structure',
        overlayZoneExtraClass: 'merged-desk-rb-smc merged-desk-rb-smc-msb-rail',
      });
      priceLines.push({
        price: p.mid,
        color: meta.stroke,
        title: faceTf,
        lineWidth: bold ? 2 : 1,
        lineStyle: 'dashed',
        axisLabel: false,
      });
      continue;
    }

    const face =
      p.dropPct != null && p.risePct != null
        ? `${p.labelKo} ·↓${fmtPct(p.dropPct)}↑${fmtPct(p.risePct)}`
        : p.labelKo;

    overlays.push({
      id,
      kind: corridor === 'SHORT' ? 'supplyZone' : 'demandZone',
      label: face,
      x1: 0,
      y1: 0,
      x2: 1,
      y2: 1,
      time1: p.time1 as UTCTimestamp,
      time2: tLast as UTCTimestamp,
      price1: p.high,
      price2: p.low,
      color: meta.color,
      confidence: p.touchActive && bold ? 92 : bold ? 75 : 40,
      category: 'zones',
      structureBias: p.bias,
      zoneFillPreserve: true,
      overlayZoneExtraClass: [
        'merged-desk-rb-smc',
        `merged-desk-rb-smc-${p.kind.toLowerCase()}`,
        p.touchActive ? 'merged-desk-zone-pro-hero' : '',
        dim ? 'merged-desk-rb-smc-wait' : 'merged-desk-rb-smc-bold',
        'merged-desk-zone-label-on',
        'merged-desk-rb-channel',
        'merged-desk-money-zone-keep',
      ]
        .filter(Boolean)
        .join(' '),
      zoneFaceBase: face,
      labelTooltip: `${face} · ${money.summaryKo} · ${money.detailKo}`,
    });
  }

  /** 목표선 + 측정 — 가로선만(축 숫자 알약 금지), zone/면으로 의미 전달 */
  if (money.targetPrice != null && entry && !waitConflict) {
    const tgt = money.targetPrice;
    priceLines.push({
      price: tgt,
      color: corridor === 'LONG' ? '#4ADE80' : '#F87171',
      title: corridor === 'LONG' ? '목표·상단' : '목표·하단',
      lineWidth: entry.touchActive ? 3 : 2,
      lineStyle: 'dotted',
      axisLabel: false,
    });
    priceLines.push({
      price: entry.mid,
      color: bold ? '#22D3EE' : '#94A3B8',
      title: entry.labelKo,
      lineWidth: entry.touchActive ? 2 : 1,
      lineStyle: 'solid',
      axisLabel: false,
    });

    /** 측정 경로 라인 (요만큼↔이만큼) — 푸시아 세트색 · 분석봉에 부착 */
    const pathId = `merged-desk-rb-smc-measure-${corridor.toLowerCase()}`;
    overlays.push({
      id: pathId,
      kind: 'trendLine',
      label:
        corridor === 'LONG'
          ? `요만큼↓${fmtPct(money.dropPct)} → 이만큼↑${fmtPct(money.risePct)}`
          : `요만큼↑${fmtPct(money.risePct)} → 이만큼↓${fmtPct(money.dropPct)}`,
      x1: 0,
      y1: 0,
      x2: 1,
      y2: 1,
      time1: entry.time1 as UTCTimestamp,
      time2: tLast as UTCTimestamp,
      price1: entry.mid,
      price2: tgt,
      color: bold ? 'rgba(255,46,182,0.9)' : 'rgba(255,46,182,0.4)',
      confidence: entry.touchActive ? 88 : 60,
      category: 'structure',
      overlayZoneExtraClass:
        'merged-desk-rb-smc merged-desk-rb-smc-measure merged-desk-thismuch-set merged-desk-zone-label-on',
      zoneFaceBase:
        corridor === 'LONG'
          ? `롱통로→채널상`
          : `숏통로→채널하`,
      labelTooltip: money.detailKo,
    });
  }

  if (waitConflict) {
    priceLines.push({
      price: close,
      color: 'rgba(250,204,21,0.75)',
      title: `WAIT·상위역방향`,
      lineWidth: 2,
      lineStyle: 'dashed',
      axisLabel: false,
    });
    const waitHalf = Math.max(atrVal * 0.1, Math.abs(close) * 0.0003);
    overlays.push({
      id: 'merged-desk-rb-smc-wait-banner',
      kind: 'supplyZone',
      label: 'WAIT · 상위MSB충돌',
      x1: 0,
      y1: 0,
      x2: 1,
      y2: 1,
      time1: Number(candles[Math.max(0, n - 24)]?.time) || tLast,
      time2: tLast as UTCTimestamp,
      price1: close + waitHalf,
      price2: close - waitHalf,
      priceFrozen1: close + waitHalf,
      priceFrozen2: close - waitHalf,
      color: 'rgba(250,204,21,0.22)',
      confidence: 50,
      category: 'structure',
      zoneFillPreserve: true,
      overlayZoneExtraClass:
        'merged-desk-rb-smc merged-desk-rb-smc-wait-label merged-desk-zone-label-on merged-desk-money-zone-keep',
      zoneFaceBase: 'WAIT·상위MSB충돌',
      zoneFaceSignal: '대기',
      labelTooltip: money.detailKo,
      noProject: true,
    });
  }

  return {
    enabled: true,
    chartTf,
    htfTf,
    money,
    pois,
    overlays,
    priceLines,
    summaryKo: money.summaryKo,
  };
}
