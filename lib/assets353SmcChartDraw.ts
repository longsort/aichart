/**
 * SMC 차트 작도 — Mirage/TV 참조형 (추세선·$$$·OB색·S/R·구조 확률).
 */
import type { Candle, OverlayItem } from '@/types';
import type { UTCTimestamp } from 'lightweight-charts';
import type { Assets353Direction, Assets353Verdict } from '@/lib/assets353CandleKnowledgeEngine';
import type { MergedSmcLeadingContext } from '@/lib/mergedAnalysisSmcLeading';
import { normalizeChartTimeframe } from '@/lib/constants';
import { buildMirageTvStructureOverlays } from '@/lib/mergedAnalysisMirageTvVisual';
import { buildMergedDeskMirageEnhanceOverlays } from '@/lib/mergedDeskMirageEnhancePack';
import { finalizeMergedDeskMirageChartOverlays } from '@/lib/mergedDeskMirageStyleDraw';
import { collectSwingPivots, type CandlePivot } from '@/lib/mergedDeskCandleTrendline';
import { detectSmcStructureOrderBlocks, isObZoneBrokenByClose } from '@/lib/smcStructureOrderBlocks';
import { snapMergedOverlayTimeToCandles } from '@/lib/mergedAnalysisOverlayTimes';
import { OVERLAY_COLORS } from '@/lib/overlayColors';
import {
  buildTripleTrendFusionOverlays,
  computeTripleTrendSmcPack,
} from '@/lib/mergedDeskTripleTrendFusionBand';
import {
  applySmcZoneConflictIntel,
  type SmcZoneBattleVerdict,
} from '@/lib/assets353SmcZoneConflictIntel';
import {
  computeObStatIntel,
  computeSrHoldPct,
  computeStructureConfirmPct,
} from '@/lib/assets353SmcStatIntel';
import {
  atrRecent,
  rangeFromPivots,
  structureMarksFu,
} from '@/lib/smcDeskOverlay';

const SWING_L = 2;
const OB_BULL = 'rgba(34,197,94,0.28)';
const OB_BEAR = 'rgba(239,68,68,0.26)';
const TV_LIQ_RES = 'rgba(248,113,113,0.88)';
const TV_LIQ_SUP = 'rgba(34,197,94,0.88)';
const TV_MACRO_TREND = 'rgba(226,232,240,0.78)';
const TV_LIQ_TREND = 'rgba(251,191,36,0.88)';

function snapT(candles: Candle[], t: number): number {
  return Number(snapMergedOverlayTimeToCandles(t, candles));
}

function tWin(candles: Candle[], bars = 48): { t1: number; t2: number } {
  const n = candles.length;
  return {
    t1: snapT(candles, Number(candles[Math.max(0, n - bars)]!.time)),
    t2: Number(candles[n - 1]!.time),
  };
}

function dedupeById(items: OverlayItem[]): OverlayItem[] {
  const seen = new Set<string>();
  const out: OverlayItem[] = [];
  for (const o of items) {
    const id = String(o.id || '');
    if (id && seen.has(id)) continue;
    if (id) seen.add(id);
    out.push(o);
  }
  return out;
}

function stripStructLines(items: OverlayItem[]): OverlayItem[] {
  return items.filter((o) => {
    const id = String(o.id || '');
    if (!id.startsWith('merged-ares-mlsp-tv-struct-')) return true;
    const k = String(o.kind || '');
    return k !== 'bos' && k !== 'choch';
  });
}

/** HQ 롱A/숏A와 동일 면 클래스 — 가로 pill + 롱녹/숏빨 */
function dirFace(bull: boolean): {
  prefix: string;
  signal: string;
  cls: string;
  pillCls: string;
} {
  return bull
    ? {
        prefix: '▲롱',
        signal: '매수',
        cls: 'merged-desk-smc-dir-long',
        pillCls:
          'merged-desk-pill-zone merged-desk-hotzone-entry overlay-zone--hotzone-signal--long',
      }
    : {
        prefix: '▼숏',
        signal: '매도',
        cls: 'merged-desk-smc-dir-short',
        pillCls:
          'merged-desk-pill-zone merged-desk-hotzone-entry overlay-zone--hotzone-signal--short',
      };
}

function tvFaceBand(params: {
  id: string;
  base: string;
  signal?: string;
  t1: number;
  t2: number;
  top: number;
  bot: number;
  color: string;
  extraClass: string;
  bias?: 'bullish' | 'bearish';
  confidence?: number;
}): OverlayItem {
  return {
    id: params.id,
    kind: 'zone',
    label: params.signal ? `${params.base} · ${params.signal}` : params.base,
    labelTooltip: params.base,
    x1: 0,
    y1: 0,
    x2: 1,
    y2: 0,
    time1: params.t1 as UTCTimestamp,
    time2: params.t2 as UTCTimestamp,
    price1: params.top,
    price2: params.bot,
    confidence: params.confidence ?? 0.74,
    color: params.color,
    category: 'mirageLSP',
    zoneFillPreserve: true,
    zoneSpanOnly: false,
    structureBias: params.bias,
    zoneFaceBase: params.base,
    zoneFaceSignal: params.signal,
    zoneFaceLang: 'ko',
    overlayZoneExtraClass: [
      params.extraClass,
      'merged-ares-mlsp-tv-zone-face',
      params.bias === 'bullish'
        ? 'merged-desk-pill-zone merged-desk-hotzone-entry overlay-zone--hotzone-signal--long'
        : params.bias === 'bearish'
          ? 'merged-desk-pill-zone merged-desk-hotzone-entry overlay-zone--hotzone-signal--short'
          : '',
    ]
      .filter(Boolean)
      .join(' '),
  };
}

function priceOnLine(p1: CandlePivot, p2: CandlePivot, idx: number): number {
  const slope = (p2.price - p1.price) / Math.max(1, p2.i - p1.i);
  return p1.price + slope * (idx - p1.i);
}

function tvTrendLine(params: {
  id: string;
  label: string;
  t1: number;
  p1: number;
  t2: number;
  p2: number;
  color: string;
  extraClass: string;
  dash?: string;
  width?: number;
}): OverlayItem {
  return {
    id: params.id,
    kind: 'trendLine',
    label: params.label,
    x1: 0,
    y1: 0,
    x2: 1,
    y2: 1,
    time1: params.t1 as UTCTimestamp,
    price1: params.p1,
    time2: params.t2 as UTCTimestamp,
    price2: params.p2,
    confidence: 0.76,
    color: params.color,
    lineDash: params.dash ?? '6 4',
    lineStrokeWidth: params.width ?? 1.25,
    category: 'mirageLSP',
    overlayZoneExtraClass: `${params.extraClass} merged-ares-mlsp-tv-trend merged-desk-candle-trend`,
    noProject: true,
    lineLabelColor: params.color,
    labelTextColor: params.color,
  };
}

function tvLiqBand(params: {
  id: string;
  label: string;
  price: number;
  t1: number;
  t2: number;
  bull: boolean;
  pct: number;
}): OverlayItem {
  const pad = Math.max(params.price * 0.00012, 1e-8);
  const df = dirFace(params.bull);
  const color = params.bull ? 'rgba(16,185,129,0.14)' : 'rgba(239,68,68,0.14)';
  return tvFaceBand({
    id: params.id,
    base: `${df.prefix} $${params.pct}`,
    signal: undefined,
    t1: params.t1,
    t2: params.t2,
    top: params.price + pad,
    bot: params.price - pad,
    color,
    bias: params.bull ? 'bullish' : 'bearish',
    confidence: params.pct / 100,
    extraClass: `merged-ares-mlsp-tv-liq-band ${df.cls}`,
  });
}

/** 매크로 추세선 + 대각 $$$ 유동성 (참조 이미지형) */
function drawTrendAndLiquidityLines(candles: Candle[], tf: string, lastIdx: number, t2: number): OverlayItem[] {
  const { highs, lows } = collectSwingPivots(candles, tf);
  const out: OverlayItem[] = [];
  const lastTime = snapT(candles, t2);

  const recentHighs = highs.slice(-3);
  if (recentHighs.length >= 2) {
    const p1 = recentHighs[0]!;
    const p2 = recentHighs[recentHighs.length - 1]!;
    const endP = priceOnLine(p1, p2, lastIdx);
    out.push(
      tvTrendLine({
        id: 'merged-ares-mlsp-tv-trend-macro-res',
        label: 'Resistance-line',
        t1: snapT(candles, p1.time),
        p1: p1.price,
        t2: lastTime,
        p2: endP,
        color: TV_MACRO_TREND,
        extraClass: 'merged-ares-mlsp-tv-tri-res',
        dash: '6 4',
      }),
      tvTrendLine({
        id: 'merged-ares-mlsp-tv-trend-liq-high',
        label: '$$$',
        t1: snapT(candles, p1.time),
        p1: p1.price,
        t2: lastTime,
        p2: endP,
        color: TV_LIQ_TREND,
        extraClass: 'merged-ares-mlsp-tv-tri-res merged-ares-mlsp-liq-line',
        dash: undefined,
        width: 1.1,
      })
    );
  }

  const recentLows = lows.slice(-3);
  if (recentLows.length >= 2) {
    const p1 = recentLows[0]!;
    const p2 = recentLows[recentLows.length - 1]!;
    const endP = priceOnLine(p1, p2, lastIdx);
    out.push(
      tvTrendLine({
        id: 'merged-ares-mlsp-tv-trend-macro-sup',
        label: 'Support-line',
        t1: snapT(candles, p1.time),
        p1: p1.price,
        t2: lastTime,
        p2: endP,
        color: TV_MACRO_TREND,
        extraClass: 'merged-ares-mlsp-tv-tri-sup',
        dash: '6 4',
      })
    );
  }

  return out;
}

function pivotHighs(candles: Candle[], wing = SWING_L) {
  const out: Array<{ price: number; time: number }> = [];
  for (let i = wing; i < candles.length - wing; i++) {
    let ok = true;
    for (let j = 1; j <= wing; j++) {
      if (candles[i]!.high <= candles[i - j]!.high || candles[i]!.high <= candles[i + j]!.high) ok = false;
    }
    if (ok) out.push({ price: candles[i]!.high, time: Number(candles[i]!.time) });
  }
  return out;
}

function pivotLows(candles: Candle[], wing = SWING_L) {
  const out: Array<{ price: number; time: number }> = [];
  for (let i = wing; i < candles.length - wing; i++) {
    let ok = true;
    for (let j = 1; j <= wing; j++) {
      if (candles[i]!.low >= candles[i - j]!.low || candles[i]!.low >= candles[i + j]!.low) ok = false;
    }
    if (ok) out.push({ price: candles[i]!.low, time: Number(candles[i]!.time) });
  }
  return out;
}

function liquidityPools(candles: Candle[]) {
  const highs = pivotHighs(candles.slice(-70), SWING_L);
  const lows = pivotLows(candles.slice(-70), SWING_L);
  const out: Array<{ price: number; time: number; bull: boolean }> = [];
  const tol = 0.0014;
  for (let i = 0; i < highs.length; i++) {
    for (let j = i + 1; j < highs.length; j++) {
      const mid = (highs[i]!.price + highs[j]!.price) / 2;
      if (mid > 0 && Math.abs(highs[i]!.price - highs[j]!.price) / mid <= tol) {
        out.push({ price: mid, time: highs[j]!.time, bull: false });
      }
    }
  }
  for (let i = 0; i < lows.length; i++) {
    for (let j = i + 1; j < lows.length; j++) {
      const mid = (lows[i]!.price + lows[j]!.price) / 2;
      if (mid > 0 && Math.abs(lows[i]!.price - lows[j]!.price) / mid <= tol) {
        out.push({ price: mid, time: lows[j]!.time, bull: true });
      }
    }
  }
  return out.slice(-3);
}

function drawHorizontalLiquidity(candles: Candle[], t2: number): OverlayItem[] {
  return liquidityPools(candles).map((liq, i) => {
    const pct = computeSrHoldPct(candles, liq.price, liq.bull ? 'support' : 'resistance');
    return tvLiqBand({
      id: `merged-ares-mlsp-tv-liq-band-${liq.bull ? 'sup' : 'res'}-${i}-${Math.round(liq.price)}`,
      label: `$$$ ${pct}%`,
      price: liq.price,
      t1: snapT(candles, liq.time),
      t2,
      bull: liq.bull,
      pct,
    });
  });
}

function pickMarks(marks: Mark[]): Mark[] {
  const choch = [...marks].reverse().find((m) => m.tag === 'CHOCH');
  const bos = [...marks].reverse().find((m) => m.tag === 'BOS' || m.tag === 'MSB');
  const out: Mark[] = [];
  if (choch) out.push(choch);
  if (bos && bos.index !== choch?.index) out.push(bos);
  return out;
}

/** BOS/ChoCH — 얇은 줄 대신 방향 밴드 + 중앙 라벨 */
function drawStructureLevelBands(candles: Candle[], marks: Mark[], t2: number): OverlayItem[] {
  const n = candles.length;
  const close = candles[n - 1]!.close;
  const pad = Math.max(atrRecent(candles, 14) * 0.22, close * 0.00015, 1e-8);
  const out: OverlayItem[] = [];

  for (const mk of pickMarks(marks)) {
    const bull = mk.bias === 'bullish';
    const { pct, confirmed } = computeStructureConfirmPct(candles, mk);
    const tag = mk.tag === 'CHOCH' ? 'ChoCH' : 'BOS';
    const df = dirFace(bull);
    const t1 = snapT(candles, Number(candles[mk.index]!.time));
    const color = bull ? 'rgba(16,185,129,0.18)' : 'rgba(239,68,68,0.16)';
    out.push(
      tvFaceBand({
        id: `merged-ares-mlsp-tv-struct-band-${mk.tag.toLowerCase()}-${mk.index}`,
        base: tag,
        signal: confirmed ? `${pct}` : undefined,
        t1,
        t2,
        top: mk.price + pad,
        bot: mk.price - pad,
        color,
        bias: mk.bias,
        confidence: pct / 100,
        extraClass: `merged-ares-mlsp-tv-struct-band ${df.cls}${confirmed ? ' merged-ares-mlsp-tv-state-confirmed' : ''}`,
      })
    );
  }
  return out;
}

type Mark = ReturnType<typeof structureMarksFu>[number];

/** zone·S/R 라벨 + 통계 · OB 매수=초록 매도=빨강 · 종가 이탈 OB는 제거 */
function applyStatZoneFaces(candles: Candle[], items: OverlayItem[]): OverlayItem[] {
  const { obs, validObs } = detectSmcStructureOrderBlocks(candles);
  const allObs = obs.length ? obs : validObs;

  const out: OverlayItem[] = [];
  for (const o of items) {
    const id = String(o.id || '');
    const kind = String(o.kind || '');

    if (id.includes('merged-ares-mlsp-tv-smc-ob-') || id.includes('merged-ares-mlsp-tv-ob-')) {
      const top = Math.max(Number(o.price1) || 0, Number(o.price2) || 0);
      const bot = Math.min(Number(o.price1) || 0, Number(o.price2) || 0);
      const isBull = id.includes('bull') || (!id.includes('bear') && o.structureBias === 'bullish');
      const bias = isBull ? ('bullish' as const) : ('bearish' as const);

      /** 형성봉 = time1 우선 (id 끝 숫자는 unix일 수 있어 index로 쓰지 않음) */
      let fromIdx = -1;
      const t1 = Number(o.time1);
      if (Number.isFinite(t1) && t1 > 0) {
        fromIdx = candles.findIndex((c) => Number(c.time) === t1);
        if (fromIdx < 0) {
          fromIdx = candles.findIndex((c) => Math.abs(Number(c.time) - t1) < 1);
        }
      }
      if (fromIdx < 0 && id.includes('smc-ob-')) {
        const idxMatch = id.match(/smc-ob-(?:bullish|bearish)-(\d+)$/);
        const idx = idxMatch ? Number(idxMatch[1]) : -1;
        if (Number.isFinite(idx) && idx >= 0 && idx < candles.length) fromIdx = idx;
      }
      if (fromIdx < 0) fromIdx = Math.max(0, candles.length - 8);

      const obHit =
        allObs.find((x) => x.index === fromIdx) ??
        validObs.find((x) => x.index === fromIdx) ??
        null;

      /** 가격은 정의봉 ICT 반구간으로 재스냅 (pad·오파싱 보정) */
      const cOb = candles[fromIdx];
      let low = bot;
      let high = top;
      if (obHit) {
        low = obHit.low;
        high = obHit.high;
      } else if (cOb) {
        low = isBull ? Math.min(cOb.open, cOb.close) : cOb.low;
        high = isBull ? cOb.high : Math.max(cOb.open, cOb.close);
      }
      if (low > 0 && high > low) {
        const broken = isObZoneBrokenByClose(candles, {
          fromIdx: obHit?.index ?? fromIdx,
          low,
          high,
          bias: obHit?.bias ?? bias,
        });
        if (broken) continue;
      }

      const intel = obHit ? computeObStatIntel(candles, obHit) : null;
      if (intel?.broken) continue;

      const df = dirFace(isBull);
      const pct = Math.round((intel?.pct ?? (Number(o.confidence) || 0.6) * 100));
      /** HQ 롱A/숏A형 — 짧은 면 캡션만 */
      const faceCap = isBull ? `OB L` : `OB S`;
      out.push({
        ...o,
        kind: isBull ? 'demandZone' : 'supplyZone',
        price1: high,
        price2: low,
        label: faceCap,
        labelTooltip: intel?.caption ?? `Order Block ${pct}% (참고·승률 아님)`,
        zoneFaceBase: faceCap,
        zoneFaceSignal: intel?.confirmed ? '확' : undefined,
        zoneFaceLang: 'ko' as const,
        color: isBull ? OB_BULL : OB_BEAR,
        structureBias: isBull ? ('bullish' as const) : ('bearish' as const),
        lineLabelColor: isBull ? '#bbf7d0' : '#fecaca',
        labelBackgroundColor: isBull ? 'rgba(6,78,59,0.95)' : 'rgba(127,29,29,0.94)',
        overlayZoneExtraClass: `${String(o.overlayZoneExtraClass || '')
          .replace(/merged-ares-mlsp-tv-ob-(bull|bear|smc-bull|smc-bear)/g, '')
          .replace(/\bmerged-desk-pill-zone\b|\bmerged-desk-hotzone-entry\b|\boverlay-zone--hotzone-signal--(long|short)\b/g, '')
          .trim()} merged-ares-mlsp-tv-ob-${isBull ? 'smc-bull' : 'smc-bear'} ${df.cls} ${df.pillCls}${intel?.confirmed ? ' merged-ares-mlsp-tv-state-confirmed' : ''}`.trim(),
        confidence: (intel?.pct ?? 60) / 100,
      });
      continue;
    }

    if (id === 'merged-ares-mlsp-tv-resist-level') {
      const t1 = Number(o.time1);
      let top = Math.max(Number(o.price1), Number(o.price2));
      let bot = Math.min(Number(o.price1), Number(o.price2));
      if (Number.isFinite(t1)) {
        const idx = candles.findIndex((c) => Number(c.time) === t1);
        const c = idx >= 0 ? candles[idx] : null;
        if (c) {
          top = c.high;
          const bodyTop = Math.max(c.open, c.close);
          const range = Math.max(c.high - c.low, 1e-12);
          bot = top - bodyTop < range * 0.18 ? top - range * 0.45 : bodyTop;
          bot = Math.min(bot, top - range * 0.12);
        }
      }
      const pct = computeSrHoldPct(candles, top, 'resistance');
      const df = dirFace(false);
      out.push({
        ...o,
        kind: 'supplyZone',
        price1: top,
        price2: bot,
        label: '저항',
        labelTooltip: `저항 유지 ${pct}% (참고·승률 아님)`,
        zoneFaceBase: '저항',
        zoneFaceSignal: undefined,
        zoneFaceLang: 'ko' as const,
        structureBias: 'bearish',
        color: 'rgba(239,68,68,0.26)',
        confidence: pct / 100,
        lineLabelColor: '#fecaca',
        labelBackgroundColor: 'rgba(127,29,29,0.94)',
        overlayZoneExtraClass: `${String(o.overlayZoneExtraClass || '')
          .replace(/\bmerged-desk-pill-zone\b|\bmerged-desk-hotzone-entry\b|\boverlay-zone--hotzone-signal--(long|short)\b/g, '')
          .trim()} ${df.cls} ${df.pillCls}`.trim(),
      });
      continue;
    }

    if (id === 'merged-ares-mlsp-tv-major-support') {
      const t1 = Number(o.time1);
      let bot = Math.min(Number(o.price1), Number(o.price2));
      let top = Math.max(Number(o.price1), Number(o.price2));
      if (Number.isFinite(t1)) {
        const idx = candles.findIndex((c) => Number(c.time) === t1);
        const c = idx >= 0 ? candles[idx] : null;
        if (c) {
          bot = c.low;
          const bodyBot = Math.min(c.open, c.close);
          const range = Math.max(c.high - c.low, 1e-12);
          top = bodyBot - bot < range * 0.18 ? bot + range * 0.45 : bodyBot;
          top = Math.max(top, bot + range * 0.12);
        }
      }
      const pct = computeSrHoldPct(candles, bot, 'support');
      const df = dirFace(true);
      out.push({
        ...o,
        kind: 'demandZone',
        price1: top,
        price2: bot,
        label: '지지',
        labelTooltip: `지지 유지 ${pct}% (참고·승률 아님)`,
        zoneFaceBase: '지지',
        zoneFaceSignal: undefined,
        zoneFaceLang: 'ko' as const,
        structureBias: 'bullish',
        color: 'rgba(34,197,94,0.28)',
        confidence: pct / 100,
        lineLabelColor: '#bbf7d0',
        labelBackgroundColor: 'rgba(6,78,59,0.95)',
        overlayZoneExtraClass: `${String(o.overlayZoneExtraClass || '')
          .replace(/\bmerged-desk-pill-zone\b|\bmerged-desk-hotzone-entry\b|\boverlay-zone--hotzone-signal--(long|short)\b/g, '')
          .trim()} ${df.cls} ${df.pillCls}`.trim(),
      });
      continue;
    }

    if (id.includes('merged-ares-mlsp-tv-sr-res-') && kind === 'trendLine') {
      const pct = computeSrHoldPct(candles, Number(o.price1), 'resistance');
      out.push({ ...o, label: `저항${pct}`, labelTooltip: `저항 ${pct}%`, confidence: pct / 100 });
      continue;
    }

    if (id.includes('merged-ares-mlsp-tv-sr-sup-') && kind === 'trendLine' && !id.includes('liq')) {
      const pct = computeSrHoldPct(candles, Number(o.price1), 'support');
      out.push({ ...o, label: `지지${pct}`, labelTooltip: `지지 ${pct}%`, confidence: pct / 100 });
      continue;
    }

    if (id.includes('merged-ares-mlsp-tv-fvg')) {
      const bull = id.includes('bullish') || o.structureBias === 'bullish';
      const df = dirFace(bull);
      out.push({
        ...o,
        kind: bull ? 'demandZone' : 'supplyZone',
        label: bull ? 'FVG L' : 'FVG S',
        zoneFaceBase: bull ? 'FVG L' : 'FVG S',
        zoneFaceSignal: undefined,
        zoneFaceLang: 'ko' as const,
        structureBias: bull ? 'bullish' : 'bearish',
        color: bull ? 'rgba(34,197,94,0.22)' : 'rgba(239,68,68,0.2)',
        overlayZoneExtraClass: `${String(o.overlayZoneExtraClass || '')
          .replace(/\bmerged-desk-pill-zone\b|\bmerged-desk-hotzone-entry\b|\boverlay-zone--hotzone-signal--(long|short)\b/g, '')
          .trim()} ${df.cls} ${df.pillCls}`.trim(),
      });
      continue;
    }

    out.push(o);
  }
  return out;
}

function draw353TradeRails(
  candles: Candle[],
  direction: Assets353Direction,
  marks: Mark[],
  t1: number,
  t2: number,
  swingHigh: number,
  swingLow: number
): OverlayItem[] {
  if (direction === 'NEUTRAL') return [];
  const last = candles[candles.length - 1]!;
  const atr = atrRecent(candles, 14) || last.close * 0.004;
  const lastCh = [...marks].reverse().find((m) => m.tag === 'CHOCH');
  const support = pivotLows(candles.slice(-60), SWING_L).pop()?.price ?? swingLow;
  const resistance = pivotHighs(candles.slice(-60), SWING_L).pop()?.price ?? swingHigh;

  let entry: number;
  let stop: number;
  let target: number;
  if (direction === 'LONG') {
    entry = lastCh ? lastCh.price + atr * 0.12 : support + atr * 0.15;
    stop = support - atr * 0.45;
    target = swingHigh;
  } else {
    entry = lastCh ? lastCh.price - atr * 0.12 : resistance - atr * 0.15;
    stop = resistance + atr * 0.45;
    target = swingLow;
  }
  const risk = Math.abs(entry - stop);
  if (risk <= 0) return [];
  if (direction === 'LONG' && target <= entry) target = entry + risk * 2;
  if (direction === 'SHORT' && target >= entry) target = entry - risk * 2;

  const rail = 'merged-desk-trade-rail-unified merged-ares-mlsp-trade-label';
  return [
    {
      id: 'merged-desk-trade-rail-smc353-entry',
      kind: 'entry',
      label: 'Entry',
      x1: 0,
      y1: 0,
      time1: t1 as UTCTimestamp,
      time2: t2 as UTCTimestamp,
      price1: entry,
      price2: entry,
      color: OVERLAY_COLORS.entry,
      lineStrokeWidth: 1.4,
      confidence: 0.74,
      category: 'mirageLSP',
      noProject: true,
      overlayZoneExtraClass: `${rail} merged-ares-mlsp-entry-line`,
    },
    {
      id: 'merged-desk-trade-rail-smc353-sl',
      kind: 'stop',
      label: 'SL',
      x1: 0,
      y1: 0,
      time1: t1 as UTCTimestamp,
      time2: t2 as UTCTimestamp,
      price1: stop,
      price2: stop,
      color: OVERLAY_COLORS.stop,
      lineStrokeWidth: 1.4,
      confidence: 0.74,
      category: 'mirageLSP',
      noProject: true,
      overlayZoneExtraClass: `${rail} merged-ares-mlsp-sl-line`,
    },
    {
      id: 'merged-desk-trade-rail-smc353-tp',
      kind: 'target',
      label: 'TP',
      x1: 0,
      y1: 0,
      time1: t1 as UTCTimestamp,
      time2: t2 as UTCTimestamp,
      price1: target,
      price2: target,
      color: OVERLAY_COLORS.target,
      lineStrokeWidth: 1.4,
      confidence: 0.74,
      category: 'mirageLSP',
      noProject: true,
      overlayZoneExtraClass: `${rail} merged-ares-mlsp-tp1-line`,
    },
  ];
}

function draw353Verdict(candles: Candle[], verdict: Assets353Verdict, _t1: number, t2: number): OverlayItem[] {
  const dir = verdict.direction;
  const pct = dir === 'LONG' ? verdict.longPct : dir === 'SHORT' ? verdict.shortPct : Math.max(verdict.longPct, verdict.shortPct);
  const confirmed = (dir === 'LONG' && verdict.longPct >= 58) || (dir === 'SHORT' && verdict.shortPct >= 58);
  const n = candles.length;
  const last = candles[n - 1]!;
  /** 마지막 봉만 얇게 — 48봉 ATR 리본(잘못된 구간) 제거 */
  const pad = Math.max(atrRecent(candles, 14) * 0.08, last.close * 0.00006, 1e-8);
  const tStart = snapT(candles, Number(candles[Math.max(0, n - 6)]!.time));
  const bull = dir === 'LONG';
  const bear = dir === 'SHORT';
  const df = bull ? dirFace(true) : bear ? dirFace(false) : { prefix: '◆대기', signal: '', cls: 'merged-desk-smc-dir-wait' };
  const base = confirmed ? `${df.prefix} ${pct}` : `${df.prefix} ${pct}`;
  const color =
    bull ? 'rgba(16,185,129,0.28)' : bear ? 'rgba(239,68,68,0.24)' : 'rgba(148,163,184,0.18)';

  return [
    tvFaceBand({
      id: 'merged-ares-mlsp-tv-dir-verdict',
      base,
      signal: confirmed ? '확' : undefined,
      t1: tStart,
      t2,
      top: last.close + pad,
      bot: last.close - pad,
      color,
      bias: bull ? 'bullish' : bear ? 'bearish' : undefined,
      confidence: verdict.confidencePct / 100,
      extraClass: `merged-desk-smc-verdict-ribbon ${df.cls}${confirmed ? ' merged-ares-mlsp-tv-state-confirmed' : ''}`,
    }),
  ];
}

/** Mirage TV + 353 SMC 작도 (참조 이미지형) */
export type Assets353SmcChartDrawPack = {
  overlays: OverlayItem[];
  battles: SmcZoneBattleVerdict[];
};

export function buildAssets353SmcChartOverlays(params: {
  candles: Candle[];
  direction: Assets353Direction;
  verdict: Assets353Verdict;
  smcLeading?: MergedSmcLeadingContext | null;
  timeframe?: string;
  currentPrice?: number | null;
}): Assets353SmcChartDrawPack {
  const { candles, direction, verdict, smcLeading } = params;
  if (candles.length < 24) return { overlays: [], battles: [] };

  const tf = normalizeChartTimeframe(params.timeframe ?? '4h');
  const n = candles.length;
  const lastIdx = n - 1;
  const start = Math.max(SWING_L, n - 100);
  const { t1, t2 } = tWin(candles);
  const range = rangeFromPivots(candles, SWING_L, start, lastIdx - 2);
  const swingHigh = range?.swingHigh ?? Math.max(...candles.slice(start).map((c) => c.high));
  const swingLow = range?.swingLow ?? Math.min(...candles.slice(start).map((c) => c.low));
  const marks = structureMarksFu(candles, SWING_L, 12);
  const close = params.currentPrice ?? candles[n - 1]!.close;

  const structEnhance = buildMergedDeskMirageEnhanceOverlays({
    candles,
    smcLeading,
    currentPrice: close,
  });

  const ttPack = computeTripleTrendSmcPack(candles, { signalBand: 3 });
  const ttOverlays = buildTripleTrendFusionOverlays(ttPack, candles, {
    includeFlipLines: false,
    includeSmcChannel: true,
    idPrefix: 'merged-ares-mlsp-tv-tt-',
  });

  const raw: OverlayItem[] = [
    ...buildMirageTvStructureOverlays(candles, tf),
    ...structEnhance,
    ...ttOverlays,
    ...drawTrendAndLiquidityLines(candles, tf, lastIdx, t2),
    ...drawHorizontalLiquidity(candles, t2),
    ...drawStructureLevelBands(candles, marks, t2),
    ...draw353TradeRails(candles, direction, marks, t1, t2, swingHigh, swingLow),
    ...draw353Verdict(candles, verdict, t1, t2),
  ];

  const stripped = stripStructLines(raw);
  const withStats = applyStatZoneFaces(candles, stripped);
  const { items: withBattle, battles } = applySmcZoneConflictIntel(candles, withStats, {
    verdict,
    smcLeading,
  });
  const deduped = dedupeById(withBattle);
  return {
    overlays: finalizeMergedDeskMirageChartOverlays(deduped),
    battles,
  };
}
