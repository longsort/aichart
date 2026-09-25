/**
 * 마감·안착 — 보드 연합 + 차트 캔들·Strike·안착 인텔을 하나의 시그널로 병합.
 * zone = 면(핫존·코어), line = E/SL/TP·가격선. 참고용·조건부.
 */
import type { AnalyzeResponse, Candle, OverlayItem } from '@/types';
import type { MonthDeskCandleZoneIntel } from '@/lib/monthDeskCandleZoneIntel';
import type { MonthDeskFusedCandleSignal } from '@/lib/monthDeskUnifiedCandleSignal';
import type { MonthDeskStrikeDeskBundle } from '@/lib/monthDeskStrikeDesk';
import type { MonthDeskUnifiedFusion, MonthDeskTradeDeskTier } from '@/lib/monthDeskUnifiedTradeDesk';
import type { MonthDeskSettleChartGuide } from '@/lib/monthDeskSettleChartGuide';

export type MergedSignalVote = {
  key: string;
  labelKo: string;
  channel: 'zone' | 'line' | 'both';
  direction: 'LONG' | 'SHORT' | 'NEUTRAL';
  weight: number;
};

export type MonthDeskMergedSignal = {
  direction: 'LONG' | 'SHORT' | 'WAIT';
  tier: MonthDeskTradeDeskTier;
  confluence: number;
  zoneScoreLong: number;
  zoneScoreShort: number;
  lineScoreLong: number;
  lineScoreShort: number;
  headlineKo: string;
  sublineKo: string;
  entry: number;
  stopLoss: number;
  tp1: number;
  tp2: number;
  tp3: number;
  zoneTop: number;
  zoneBot: number;
  zoneCoreTop: number;
  zoneCoreBot: number;
  votes: MergedSignalVote[];
  sourcesKo: string[];
};

const MERGED_IDS = {
  zone: 'month-desk-merged-signal-zone',
  core: 'month-desk-merged-signal-core',
  entry: 'month-desk-merged-signal-e',
  sl: 'month-desk-merged-signal-sl',
  tp1: 'month-desk-merged-signal-tp1',
  tp2: 'month-desk-merged-signal-tp2',
  tp3: 'month-desk-merged-signal-tp3',
  pin: 'month-desk-merged-signal-pin',
} as const;

function fmtPx(p: number): string {
  const a = Math.abs(p);
  if (a >= 1000) return p.toFixed(1);
  if (a >= 1) return p.toFixed(4);
  return p.toFixed(5);
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function addVote(
  votes: MergedSignalVote[],
  v: MergedSignalVote
): { zoneL: number; zoneS: number; lineL: number; lineS: number } {
  votes.push(v);
  const w = v.weight;
  let zoneL = 0;
  let zoneS = 0;
  let lineL = 0;
  let lineS = 0;
  if (v.channel === 'zone' || v.channel === 'both') {
    if (v.direction === 'LONG') zoneL += w;
    if (v.direction === 'SHORT') zoneS += w;
  }
  if (v.channel === 'line' || v.channel === 'both') {
    if (v.direction === 'LONG') lineL += w;
    if (v.direction === 'SHORT') lineS += w;
  }
  return { zoneL, zoneS, lineL, lineS };
}

function tierRank(t: MonthDeskTradeDeskTier): number {
  if (t === 'CONFIRMED') return 4;
  if (t === 'CANDIDATE') return 3;
  if (t === 'BIAS') return 2;
  if (t === 'MTF_VETO') return 1;
  return 0;
}

function pickTier(a: MonthDeskTradeDeskTier, b: MonthDeskTradeDeskTier): MonthDeskTradeDeskTier {
  return tierRank(a) >= tierRank(b) ? a : b;
}

function primaryLeg(bundle: MonthDeskStrikeDeskBundle | null) {
  if (!bundle) return null;
  if (bundle.primary === 'LONG' && bundle.long) return bundle.long;
  if (bundle.primary === 'SHORT' && bundle.short) return bundle.short;
  if (bundle.long && bundle.short) {
    return bundle.long.score >= bundle.short.score ? bundle.long : bundle.short;
  }
  return bundle.long ?? bundle.short;
}

/** 보드·차트·Strike 소스 병합 */
export function computeMonthDeskMergedSignal(params: {
  candles: Candle[];
  timeframe: string;
  boardFusion: MonthDeskUnifiedFusion | null;
  strikeBundle: MonthDeskStrikeDeskBundle | null;
  candleIntel?: MonthDeskCandleZoneIntel | null;
  fusedCandle?: MonthDeskFusedCandleSignal | null;
  settleGuide?: MonthDeskSettleChartGuide | null;
  analysis?: AnalyzeResponse | null;
}): MonthDeskMergedSignal | null {
  const { candles, boardFusion, strikeBundle, candleIntel, fusedCandle, settleGuide } = params;
  if (candles.length < 4) return null;

  const close = Number(candles[candles.length - 1]?.close);
  if (!Number.isFinite(close)) return null;

  const votes: MergedSignalVote[] = [];
  let zoneScoreLong = 0;
  let zoneScoreShort = 0;
  let lineScoreLong = 0;
  let lineScoreShort = 0;

  if (boardFusion) {
    const w = boardFusion.tier === 'CONFIRMED' ? 1.35 : boardFusion.tier === 'CANDIDATE' ? 1.1 : 0.85;
    const dir =
      boardFusion.direction === 'LONG' ? 'LONG' : boardFusion.direction === 'SHORT' ? 'SHORT' : 'NEUTRAL';
    const d = addVote(votes, {
      key: 'board_fusion',
      labelKo: '보드 연합',
      channel: 'both',
      direction: dir,
      weight: w * (boardFusion.confidencePct / 100),
    });
    zoneScoreLong += d.zoneL;
    zoneScoreShort += d.zoneS;
    lineScoreLong += d.lineL;
    lineScoreShort += d.lineS;
  }

  if (strikeBundle?.fusion) {
    const f = strikeBundle.fusion;
    const w = 1.15;
    const dir = f.direction === 'LONG' ? 'LONG' : f.direction === 'SHORT' ? 'SHORT' : 'NEUTRAL';
    const d = addVote(votes, {
      key: 'strike_fusion',
      labelKo: 'Strike 연합',
      channel: 'both',
      direction: dir,
      weight: w,
    });
    zoneScoreLong += d.zoneL;
    zoneScoreShort += d.zoneS;
    lineScoreLong += d.lineL;
    lineScoreShort += d.lineS;
  }

  const ai = strikeBundle?.ai;
  if (ai) {
    const dir =
      ai.phase === 'hot' && ai.long && ai.short
        ? ai.long.confluence >= ai.short.confluence
          ? 'LONG'
          : 'SHORT'
        : ai.phase === 'hot' && ai.long
          ? 'LONG'
          : ai.phase === 'hot' && ai.short
            ? 'SHORT'
            : strikeBundle?.primary === 'LONG' || strikeBundle?.primary === 'SHORT'
              ? strikeBundle.primary
              : 'NEUTRAL';
    const w = ai.confluence / 100;
    const d = addVote(votes, {
      key: 'strike_ai',
      labelKo: `Strike AI ${ai.phaseKo}`,
      channel: 'line',
      direction: dir,
      weight: w * 1.2,
    });
    lineScoreLong += d.lineL;
    lineScoreShort += d.lineS;
  }

  if (candleIntel && candleIntel.bias !== 'NEUTRAL') {
    const d = addVote(votes, {
      key: 'candle_intel',
      labelKo: '캔들×레벨',
      channel: 'zone',
      direction: candleIntel.bias,
      weight: 0.75,
    });
    zoneScoreLong += d.zoneL;
    zoneScoreShort += d.zoneS;
  }

  if (fusedCandle && fusedCandle.direction !== 'WAIT') {
    const d = addVote(votes, {
      key: 'candle_fusion',
      labelKo: `캔들 연합 ${fusedCandle.tierKo}`,
      channel: 'both',
      direction: fusedCandle.direction,
      weight: (fusedCandle.confidencePct / 100) * 0.9,
    });
    zoneScoreLong += d.zoneL;
    zoneScoreShort += d.zoneS;
    lineScoreLong += d.lineL;
    lineScoreShort += d.lineS;
  }

  if (settleGuide && settleGuide.bias !== 'NONE') {
    const dir = settleGuide.bias;
    const w =
      settleGuide.step === 'confirm' ? 1.0 : settleGuide.step === 'settle' ? 0.7 : 0.45;
    const d = addVote(votes, {
      key: 'settle_guide',
      labelKo: settleGuide.stepKo || '안착 단계',
      channel: 'zone',
      direction: dir,
      weight: w,
    });
    zoneScoreLong += d.zoneL;
    zoneScoreShort += d.zoneS;
  }

  const margin = 0.45;
  const combinedLong = zoneScoreLong * 0.55 + lineScoreLong * 0.45;
  const combinedShort = zoneScoreShort * 0.55 + lineScoreShort * 0.45;

  let direction: 'LONG' | 'SHORT' | 'WAIT' = 'WAIT';
  if (combinedLong > combinedShort + margin) direction = 'LONG';
  else if (combinedShort > combinedLong + margin) direction = 'SHORT';

  let tier: MonthDeskTradeDeskTier = 'WAIT';
  if (boardFusion) tier = boardFusion.tier;
  if (strikeBundle?.fusion) tier = pickTier(tier, strikeBundle.fusion.tier);

  const total = combinedLong + combinedShort;
  const confluence =
    total > 0
      ? Math.round(
          (100 * (direction === 'LONG' ? combinedLong : direction === 'SHORT' ? combinedShort : Math.max(combinedLong, combinedShort))) /
            total
        )
      : 50;

  const leg = primaryLeg(strikeBundle);
  const fusion = boardFusion ?? strikeBundle?.fusion ?? null;

  let entry = leg?.entry ?? fusion?.entry ?? close;
  let stopLoss = leg?.stopLoss ?? fusion?.stopLoss ?? close * 0.98;
  let tp1 = leg?.tp1 ?? fusion?.tp1 ?? close * 1.02;
  let tp2 = leg?.tp2 ?? fusion?.tp2 ?? tp1 * 1.015;
  let tp3 = leg?.tp3 ?? fusion?.tp3 ?? tp2 * 1.015;
  let zoneTop = leg?.zoneTop ?? fusion?.zoneTop ?? close * 1.008;
  let zoneBot = leg?.zoneBot ?? fusion?.zoneBot ?? close * 0.992;
  let zoneCoreTop = fusion?.zoneCoreTop ?? (zoneTop + zoneBot) / 2 + (zoneTop - zoneBot) * 0.15;
  let zoneCoreBot = fusion?.zoneCoreBot ?? (zoneTop + zoneBot) / 2 - (zoneTop - zoneBot) * 0.15;

  if (direction === 'SHORT' && leg?.side === 'LONG') {
    const alt = strikeBundle?.short;
    if (alt) {
      entry = alt.entry;
      stopLoss = alt.stopLoss;
      tp1 = alt.tp1;
      tp2 = alt.tp2;
      tp3 = alt.tp3;
      zoneTop = alt.zoneTop;
      zoneBot = alt.zoneBot;
    }
  }
  if (direction === 'LONG' && leg?.side === 'SHORT') {
    const alt = strikeBundle?.long;
    if (alt) {
      entry = alt.entry;
      stopLoss = alt.stopLoss;
      tp1 = alt.tp1;
      tp2 = alt.tp2;
      tp3 = alt.tp3;
      zoneTop = alt.zoneTop;
      zoneBot = alt.zoneBot;
    }
  }

  const tierKo =
    tier === 'CONFIRMED' ? '확정' : tier === 'CANDIDATE' ? '후보' : tier === 'BIAS' ? '편향' : '대기';
  const dirKo = direction === 'LONG' ? '롱' : direction === 'SHORT' ? '숏' : '대기';
  const headlineKo =
    direction === 'WAIT'
      ? `병합·관망 — zone ${zoneScoreLong.toFixed(1)}/${zoneScoreShort.toFixed(1)} · line ${lineScoreLong.toFixed(1)}/${lineScoreShort.toFixed(1)}`
      : `병합 ${dirKo} ${tierKo} · ${confluence}% — E ${fmtPx(entry)}`;
  const sublineKo = votes
    .slice(0, 6)
    .map((v) => v.labelKo)
    .join(' · ');

  const sourcesKo = votes.map((v) => v.labelKo).slice(0, 10);

  return {
    direction,
    tier,
    confluence,
    zoneScoreLong,
    zoneScoreShort,
    lineScoreLong,
    lineScoreShort,
    headlineKo,
    sublineKo,
    entry,
    stopLoss,
    tp1,
    tp2,
    tp3,
    zoneTop,
    zoneBot,
    zoneCoreTop,
    zoneCoreBot,
    votes,
    sourcesKo,
  };
}

function horizLine(
  id: string,
  label: string,
  price: number,
  color: string,
  t1: number,
  t2: number,
  tip: string,
  extra?: Partial<OverlayItem>
): OverlayItem {
  return {
    id,
    kind: 'keyLevel',
    label,
    x1: 0,
    y1: 0,
    x2: 1,
    y2: 0,
    time1: t1,
    time2: t2,
    price1: price,
    confidence: 92,
    color,
    category: 'scenario',
    labelTooltip: tip,
    ...extra,
  };
}

/** zone 면 + line 가격선 분리 출력 */
export function buildMonthDeskMergedSignalOverlays(
  signal: MonthDeskMergedSignal,
  candles: Candle[]
): { zoneOverlays: OverlayItem[]; lineOverlays: OverlayItem[] } {
  const n = candles.length;
  if (n < 2) return { zoneOverlays: [], lineOverlays: [] };
  const t2 = Number(candles[n - 1]?.time);
  const t1 = Number(candles[Math.max(0, n - 56)]?.time);
  const close = Number(candles[n - 1]?.close);
  if (!Number.isFinite(t1) || !Number.isFinite(t2) || !Number.isFinite(close)) {
    return { zoneOverlays: [], lineOverlays: [] };
  }

  const isLong = signal.direction === 'LONG';
  const isShort = signal.direction === 'SHORT';
  const zoneKind: OverlayItem['kind'] = isShort ? 'supplyZone' : isLong ? 'demandZone' : 'zone';
  const zoneFill = isLong
    ? 'rgba(34,197,94,0.14)'
    : isShort
      ? 'rgba(239,68,68,0.12)'
      : 'rgba(148,163,184,0.08)';
  const coreFill = isLong
    ? 'rgba(74,222,128,0.22)'
    : isShort
      ? 'rgba(248,113,113,0.18)'
      : 'rgba(148,163,184,0.1)';

  const tip = [
    signal.headlineKo,
    signal.sublineKo,
    `zone L/S ${signal.zoneScoreLong.toFixed(1)}/${signal.zoneScoreShort.toFixed(1)} · line L/S ${signal.lineScoreLong.toFixed(1)}/${signal.lineScoreShort.toFixed(1)}`,
    `E ${fmtPx(signal.entry)} · SL ${fmtPx(signal.stopLoss)} · TP1 ${fmtPx(signal.tp1)}`,
    '보드+캔들+Strike 병합 — 참고용',
  ].join('\n');

  const zoneOverlays: OverlayItem[] = [];
  if (signal.zoneTop > signal.zoneBot + 1e-9) {
    zoneOverlays.push({
      id: MERGED_IDS.zone,
      kind: zoneKind,
      label: isLong ? '병합L존' : isShort ? '병합S존' : '병합존',
      x1: 0,
      y1: 0,
      x2: 1,
      y2: 0,
      time1: t1,
      time2: t2,
      price1: signal.zoneTop,
      price2: signal.zoneBot,
      confidence: signal.confluence,
      color: zoneFill,
      category: 'scenario',
      labelTooltip: tip,
      zoneFillPreserve: true,
      zonePulse: signal.tier === 'CONFIRMED' || signal.tier === 'CANDIDATE',
      overlayZoneExtraClass: `overlay-zone--monthdesk-merged overlay-zone--merged-${isLong ? 'long' : isShort ? 'short' : 'wait'}`,
      labelBackgroundColor: isLong
        ? 'rgba(21,128,61,0.94)'
        : isShort
          ? 'rgba(127,29,29,0.94)'
          : 'rgba(51,65,85,0.9)',
      labelTextColor: '#f8fafc',
    } as OverlayItem);
  }

  if (signal.zoneCoreTop > signal.zoneCoreBot + 1e-9 && (isLong || isShort)) {
    zoneOverlays.push({
      id: MERGED_IDS.core,
      kind: zoneKind,
      label: '핫코어',
      x1: 0,
      y1: 0,
      x2: 1,
      y2: 0,
      time1: t1,
      time2: t2,
      price1: signal.zoneCoreTop,
      price2: signal.zoneCoreBot,
      confidence: clamp(signal.confluence + 4, 0, 99),
      color: coreFill,
      category: 'scenario',
      labelTooltip: tip,
      zoneFillPreserve: true,
      overlayZoneExtraClass: 'overlay-zone--monthdesk-merged-core',
    } as OverlayItem);
  }

  const lineOverlays: OverlayItem[] = [];
  if (isLong || isShort) {
    const eColor = isLong ? 'rgba(250,204,21,0.98)' : 'rgba(251,146,60,0.98)';
    lineOverlays.push(
      horizLine(MERGED_IDS.entry, `E ${signal.confluence}`, signal.entry, eColor, t1, t2, tip, {
        lineStrokeWidth: 3.2,
        lineLabelColor: isLong ? '#fde047' : '#fdba74',
        labelBackgroundColor: 'rgba(88,28,135,0.88)',
      }),
      horizLine(MERGED_IDS.sl, 'SL', signal.stopLoss, 'rgba(248,113,113,0.95)', t1, t2, tip, {
        lineDash: '5 4',
        lineLabelColor: '#fecaca',
      }),
      horizLine(MERGED_IDS.tp1, 'TP1', signal.tp1, 'rgba(134,239,172,0.92)', t1, t2, tip, {
        lineDash: '8 5',
        lineLabelColor: '#bbf7d0',
      }),
      horizLine(MERGED_IDS.tp2, 'TP2', signal.tp2, 'rgba(125,211,252,0.9)', t1, t2, tip, {
        lineDash: '8 6',
        lineLabelColor: '#7dd3fc',
      }),
      horizLine(MERGED_IDS.tp3, 'TP3', signal.tp3, 'rgba(167,139,250,0.88)', t1, t2, tip, {
        lineDash: '6 8',
        lineLabelColor: '#ddd6fe',
      })
    );
  }

  lineOverlays.push({
    id: MERGED_IDS.pin,
    kind: 'label',
    label: signal.headlineKo.length > 28 ? `${signal.headlineKo.slice(0, 27)}…` : signal.headlineKo,
    x1: 0,
    y1: 0,
    time1: t2,
    price1: close,
    confidence: 95,
    color: isLong ? '#4ade80' : isShort ? '#f87171' : '#94a3b8',
    labelBackgroundColor: 'rgba(6,12,24,0.92)',
    labelTextColor: '#f8fafc',
    labelTooltip: tip,
    category: 'scenario',
  });

  return { zoneOverlays, lineOverlays };
}

/** 병합 시그널 켜면 중복 Strike·연합·plan 라인 제거 */
export function stripDuplicateMonthDeskSignalOverlays(items: OverlayItem[]): OverlayItem[] {
  const dropPrefixes = [
    'month-desk-strike-',
    'month-desk-unified-',
    'month-desk-plan-',
    'month-desk-signal-',
    'month-desk-typeom-entry',
    'month-desk-typeom-inv',
    'month-desk-typeom-tp',
    'trade-atlas-entry',
  ];
  return items.filter((o) => {
    const id = String(o.id || '');
    return !dropPrefixes.some((p) => id.startsWith(p));
  });
}

export function applyMonthDeskMergedSignalToOverlays(
  items: OverlayItem[],
  merged: { zoneOverlays: OverlayItem[]; lineOverlays: OverlayItem[] }
): OverlayItem[] {
  const base = stripDuplicateMonthDeskSignalOverlays(items);
  return [...merged.zoneOverlays, ...merged.lineOverlays, ...base];
}
