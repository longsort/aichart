/**
 * 아틀라스 펄스 데스크 — 기관밴드·로켓 유지, 나머지는 차트 전용 통합 시각 언어.
 *
 * Pulse Code (캔들 아이콘):
 *   ⚡ 돌파 · ◆ 안착 · ★ 확인 · ✕ 실패 · ▲ 롱 · ▼ 숏
 *
 * Zone·Line (글자 없음):
 *   코어존 · 실드(SL) · 사다리(TP) · E/SL/TP 수평선
 */
import type { AnalyzeResponse, Candle, OverlayItem } from '@/types';
import type { UTCTimestamp } from 'lightweight-charts';
import type { MonthDeskBandFusionContext } from '@/lib/institutionalSuperBand';
import type { MonthDeskStrikeDeskBundle, MonthDeskStrikeLeg } from '@/lib/monthDeskStrikeDesk';
import {
  buildMonthDeskSettleChartGuide,
  type MonthDeskSettleChartMarker,
} from '@/lib/monthDeskSettleChartGuide';
import {
  buildMonthDeskLastBarCleanIconMarkers,
  type MonthDeskCleanIconContext,
} from '@/lib/monthDeskCleanZoneLineSignals';
import { normalizeChartTimeframe } from '@/lib/constants';
import { lastBarSpan, filterEntryIconsToLastBar, focusPulseMarkersToLastBar } from '@/lib/monthDeskLastCandleFocus';

export const ATLAS_PULSE_IDS = {
  coreZone: 'atlas-pulse-core-zone',
  shieldZone: 'atlas-pulse-shield-zone',
  rewardLadder: 'atlas-pulse-reward-ladder',
  breakLevel: 'atlas-pulse-break-level',
  entry: 'atlas-pulse-e',
  sl: 'atlas-pulse-sl',
  tp1: 'atlas-pulse-tp1',
  tp2: 'atlas-pulse-tp2',
  tp3: 'atlas-pulse-tp3',
  altCore: 'atlas-pulse-alt-core',
} as const;

export type AtlasPulsePriceLine = {
  price: number;
  color: string;
  title: string;
  lineWidth: 1 | 2 | 3 | 4;
  lineStyle: 'solid' | 'dashed' | 'dotted';
  /** TradingView식 우측 축 라벨 표시 (지표형) */
  axisLabel?: boolean;
};

export type AtlasPulseMarker = {
  time: UTCTimestamp;
  position: 'aboveBar' | 'belowBar';
  shape: 'square' | 'circle';
  color: string;
  text: string;
  size: 1 | 2 | 3;
  id: string;
};

export type AtlasPulseDeskMeta = {
  primary: 'LONG' | 'SHORT' | 'NEUTRAL';
  step: 'wait' | 'break' | 'settle' | 'confirm' | 'failed' | 'fake';
  stepKo: string;
  entry: number;
  stopLoss: number;
  tp1: number;
  tp2: number;
  tp3: number;
  breakLevel: number | null;
  confluence: number;
};

function barSpan(candles: Candle[], lookback = 8): { t1: number; t2: number } {
  return lastBarSpan(candles, lookback);
}

function hLine(
  id: string,
  price: number,
  color: string,
  t1: number,
  t2: number,
  extra?: Partial<OverlayItem>
): OverlayItem {
  return {
    id,
    kind: 'keyLevel',
    label: '',
    x1: 0,
    y1: 0,
    x2: 1,
    y2: 0,
    time1: t1,
    time2: t2,
    price1: price,
    price2: price,
    confidence: 98,
    color,
    lineStrokeWidth: extra?.lineStrokeWidth ?? 2.5,
    lineDash: extra?.lineDash,
    category: 'scenario',
    labelTooltip: '',
    overlayZoneExtraClass: extra?.overlayZoneExtraClass,
    ...extra,
  };
}

function zoneFace(
  id: string,
  top: number,
  bot: number,
  color: string,
  t1: number,
  t2: number,
  kind: 'demandZone' | 'supplyZone',
  extraClass: string
): OverlayItem {
  return {
    id,
    kind,
    label: '',
    x1: 0,
    y1: 0,
    x2: 1,
    y2: 0,
    time1: t1,
    time2: t2,
    price1: top,
    price2: bot,
    confidence: 97,
    color,
    category: 'scenario',
    zoneFillPreserve: true,
    labelTooltip: '',
    overlayZoneExtraClass: extraClass,
  };
}

function primaryLeg(bundle: MonthDeskStrikeDeskBundle): MonthDeskStrikeLeg | null {
  if (bundle.primary === 'LONG' && bundle.long) return bundle.long;
  if (bundle.primary === 'SHORT' && bundle.short) return bundle.short;
  return bundle.long ?? bundle.short ?? null;
}

function altLeg(bundle: MonthDeskStrikeDeskBundle, primary: MonthDeskStrikeLeg | null): MonthDeskStrikeLeg | null {
  if (!primary) return null;
  if (primary.side === 'LONG') return bundle.short;
  return bundle.long;
}

function settleMarkerToAtlas(m: MonthDeskSettleChartMarker): AtlasPulseMarker | null {
  const tx = String(m.text || '');
  let icon = '';
  if (tx.includes('가짜') || tx.includes('실패') || tx.includes('재시험✗')) icon = '✕';
  else if (tx.includes('3·') || tx.includes('확인')) icon = '★';
  else if (tx.includes('2·') || tx.includes('안착')) icon = '◆';
  else if (tx.includes('1·') || tx.includes('돌파')) icon = '⚡';
  else if (tx.includes('재시험✓')) icon = '◆';
  else return null;

  const bull = m.color.includes('4ADE') || m.color.includes('22C55') || m.color.includes('2DD4') || m.color.includes('FACC');
  return {
    time: m.time as UTCTimestamp,
    position: m.position === 'inBar' ? 'belowBar' : m.position,
    shape: icon === '★' || icon === '⚡' ? 'square' : 'circle',
    color: icon === '✕' ? '#F87171' : bull ? '#22D3EE' : '#FB923C',
    text: icon,
    size: icon === '★' ? 2 : 1,
    id: `atlas-pulse-settle-${icon}-${m.time}`,
  };
}

function buildLegAtlasOverlays(
  leg: MonthDeskStrikeLeg,
  t1: number,
  t2: number,
  role: 'primary' | 'alt'
): OverlayItem[] {
  const isLong = leg.side === 'LONG';
  const isPrimary = role === 'primary';
  const prefix = isPrimary ? 'atlas-pulse' : 'atlas-pulse-alt';

  const coreColor = isLong
    ? isPrimary
      ? 'rgba(34,211,238,0.32)'
      : 'rgba(34,211,238,0.12)'
    : isPrimary
      ? 'rgba(248,113,113,0.34)'
      : 'rgba(248,113,113,0.14)';

  const shieldTop = isLong ? leg.entry : leg.stopLoss;
  const shieldBot = isLong ? leg.stopLoss : leg.entry;
  const rewardTop = isLong ? leg.tp3 : leg.entry;
  const rewardBot = isLong ? leg.entry : leg.tp3;

  const out: OverlayItem[] = [
    zoneFace(
      isPrimary ? ATLAS_PULSE_IDS.coreZone : ATLAS_PULSE_IDS.altCore,
      leg.zoneTop,
      leg.zoneBot,
      coreColor,
      t1,
      t2,
      isLong ? 'demandZone' : 'supplyZone',
      `overlay-zone--atlas-pulse-${isLong ? 'long' : 'short'}${isPrimary ? ' overlay-zone--atlas-primary' : ''}`
    ),
  ];

  if (isPrimary) {
    out.push(
      zoneFace(
        ATLAS_PULSE_IDS.shieldZone,
        Math.max(shieldTop, shieldBot),
        Math.min(shieldTop, shieldBot),
        'rgba(239,68,68,0.22)',
        t1,
        t2,
        isLong ? 'demandZone' : 'supplyZone',
        'overlay-zone--atlas-shield'
      ),
      zoneFace(
        ATLAS_PULSE_IDS.rewardLadder,
        Math.max(rewardTop, rewardBot),
        Math.min(rewardTop, rewardBot),
        isLong ? 'rgba(34,197,94,0.18)' : 'rgba(251,146,60,0.16)',
        t1,
        t2,
        isLong ? 'demandZone' : 'supplyZone',
        'overlay-zone--atlas-reward'
      ),
      hLine(ATLAS_PULSE_IDS.entry, leg.entry, 'rgba(250,204,21,0.98)', t1, t2, {
        lineStrokeWidth: 3,
        overlayZoneExtraClass: 'overlay-line--atlas-e',
      }),
      hLine(ATLAS_PULSE_IDS.sl, leg.stopLoss, 'rgba(248,113,113,0.95)', t1, t2, {
        lineStrokeWidth: 2,
        lineDash: '6 4',
        overlayZoneExtraClass: 'overlay-line--atlas-sl',
      }),
      hLine(ATLAS_PULSE_IDS.tp1, leg.tp1, 'rgba(134,239,172,0.92)', t1, t2, {
        lineStrokeWidth: 2,
        lineDash: '4 5',
        overlayZoneExtraClass: 'overlay-line--atlas-tp1',
      }),
      hLine(ATLAS_PULSE_IDS.tp2, leg.tp2, 'rgba(125,211,252,0.88)', t1, t2, {
        lineStrokeWidth: 1,
        lineDash: '4 6',
        overlayZoneExtraClass: 'overlay-line--atlas-tp2',
      }),
      hLine(ATLAS_PULSE_IDS.tp3, leg.tp3, 'rgba(167,139,250,0.85)', t1, t2, {
        lineStrokeWidth: 1,
        lineDash: '2 6',
        overlayZoneExtraClass: 'overlay-line--atlas-tp3',
      })
    );
  }

  return out;
}

export function buildAtlasPulseDeskOverlays(
  bundle: MonthDeskStrikeDeskBundle,
  candles: Candle[],
  breakLevel: number | null
): OverlayItem[] {
  if (candles.length < 4) return [];
  const { t1, t2 } = barSpan(candles);
  if (!Number.isFinite(t1) || !Number.isFinite(t2)) return [];

  const pri = primaryLeg(bundle);
  const alt = altLeg(bundle, pri);
  const out: OverlayItem[] = [];
  if (alt && alt !== pri) out.push(...buildLegAtlasOverlays(alt, t1, t2, 'alt'));
  if (pri) out.push(...buildLegAtlasOverlays(pri, t1, t2, 'primary'));

  if (breakLevel != null && Number.isFinite(breakLevel) && pri) {
    out.push(
      hLine(ATLAS_PULSE_IDS.breakLevel, breakLevel, 'rgba(251,191,36,0.88)', t1, t2, {
        lineStrokeWidth: 2,
        lineDash: '3 4',
        overlayZoneExtraClass: 'overlay-line--atlas-break',
      })
    );
  }

  return out;
}

export function buildAtlasPulseDeskPriceLines(leg: MonthDeskStrikeLeg | null): AtlasPulsePriceLine[] {
  if (!leg) return [];
  return [
    { price: leg.entry, color: '#FACC15', title: 'E', lineWidth: 2, lineStyle: 'solid' },
    { price: leg.stopLoss, color: '#F87171', title: 'SL', lineWidth: 1, lineStyle: 'dashed' },
    { price: leg.tp1, color: '#86EFAC', title: 'TP1', lineWidth: 1, lineStyle: 'dotted' },
    { price: leg.tp2, color: '#7DD3FC', title: 'TP2', lineWidth: 1, lineStyle: 'dotted' },
    { price: leg.tp3, color: '#A78BFA', title: 'TP3', lineWidth: 1, lineStyle: 'dotted' },
  ];
}

const ATLAS_CLUTTER_PREFIXES = [
  'month-desk-strike-',
  'month-desk-plan-',
  'month-desk-signal-',
  'month-desk-pin-',
  'month-desk-merged-signal-',
  'month-desk-click-precision-',
  'trade-atlas-',
  'month-desk-typeom-entry',
  'month-desk-typeom-sl',
  'month-desk-typeom-tp',
  'month-desk-core-long-entry',
  'month-desk-core-short-entry',
] as const;

/** 아틀라스 모드 — atlas-pulse + 필수 밴드/핫존만, 나머지 타점·카드형 레이어 제거 */
export function filterOverlaysForAtlasPulseDesk(items: OverlayItem[]): OverlayItem[] {
  return items.filter((o) => {
    const id = String(o.id || '');
    if (id.startsWith('atlas-pulse-')) return true;
    if (String(o.kind) === 'label') return false;
    if (ATLAS_CLUTTER_PREFIXES.some((p) => id.startsWith(p))) return false;
    if (id.startsWith('month-desk-chart-deck')) return false;
    return true;
  });
}

export function computeAtlasPulseDeskPack(params: {
  candles: Candle[];
  timeframe: string;
  bundle: MonthDeskStrikeDeskBundle;
  probePack: OverlayItem[];
  fusion: MonthDeskBandFusionContext | null;
  analysis?: AnalyzeResponse | null;
  bandTouchByTime?: Map<number, Array<{ verdict: 'LONG' | 'SHORT'; tier?: 'A' | 'B' | 'C' }>>;
}): {
  overlays: OverlayItem[];
  markers: AtlasPulseMarker[];
  priceLines: AtlasPulsePriceLine[];
  meta: AtlasPulseDeskMeta;
} | null {
  const { candles, timeframe, bundle, probePack, fusion, analysis, bandTouchByTime } = params;
  if (candles.length < 8) return null;

  const settleOut = buildMonthDeskSettleChartGuide(candles, probePack, {
    timeframe,
    analysis: analysis ?? null,
  });
  const guide = settleOut?.guide;
  const breakLevel = guide?.levelPrice ?? null;

  const pri = primaryLeg(bundle);
  const overlays = buildAtlasPulseDeskOverlays(bundle, candles, breakLevel);
  const priceLines = buildAtlasPulseDeskPriceLines(pri);

  const ctx: MonthDeskCleanIconContext = { fusion, bandTouchByTime };
  const entryIcons = buildMonthDeskLastBarCleanIconMarkers({
    candles,
    timeframe,
    strikeBundle: bundle,
    ctx,
  }).map((m) => ({
    time: m.time,
    position: m.position,
    shape: m.shape,
    color: m.color,
    text: m.text,
    size: m.size,
    id: m.id.replace('month-desk-clean', 'atlas-pulse-entry'),
  }));

  const lifecycle: AtlasPulseMarker[] = (settleOut?.markers ?? [])
    .map(settleMarkerToAtlas)
    .filter((m): m is AtlasPulseMarker => m != null);

  const markers = focusPulseMarkersToLastBar(
    [...lifecycle, ...filterEntryIconsToLastBar(entryIcons, candles)],
    candles,
    {
      step: guide?.step ?? 'wait',
      primary: bundle.primary,
    }
  );
  const aiConf =
    bundle.primary === 'LONG'
      ? bundle.ai?.long?.confluence ?? bundle.long?.score ?? 50
      : bundle.primary === 'SHORT'
        ? bundle.ai?.short?.confluence ?? bundle.short?.score ?? 50
        : 50;

  const meta: AtlasPulseDeskMeta = {
    primary: bundle.primary,
    step: guide?.step ?? 'wait',
    stepKo: guide?.stepKo ?? '대기',
    entry: pri?.entry ?? bundle.close,
    stopLoss: pri?.stopLoss ?? bundle.close,
    tp1: pri?.tp1 ?? bundle.close,
    tp2: pri?.tp2 ?? bundle.close,
    tp3: pri?.tp3 ?? bundle.close,
    breakLevel,
    confluence: Math.round(Math.min(96, Math.max(38, aiConf))),
  };

  return { overlays, markers, priceLines, meta };
}

export function isAtlasPulsePreservedChartMarker(m: { text?: string }): boolean {
  const tx = String(m.text ?? '').trim();
  if (['⚡', '◆', '★', '✕', '▲', '▼'].includes(tx)) return true;
  if (tx === '🚀' || tx === '📉' || tx.includes('🚀') || tx.includes('📉')) return true;
  if (/^[⚡]?[LS][HP]?[★◆·]$/.test(tx)) return true;
  return false;
}
