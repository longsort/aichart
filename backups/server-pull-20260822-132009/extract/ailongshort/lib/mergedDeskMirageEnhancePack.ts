/**
 * 통합·분석 Mirage 보강 — BOS/CHOCH 수평선 · T1/T2 목표 · key+critical 합류 면.
 */
import type { Candle, OverlayItem } from '@/types';
import type { UTCTimestamp } from 'lightweight-charts';
import type { MergedCriticalZone } from '@/lib/mergedAnalysisCriticalZones';
import type { MergedKeyZone } from '@/lib/mergedAnalysisKeyZones';
import type { MergedSmcLeadingContext } from '@/lib/mergedAnalysisSmcLeading';
import { chochMarkerLabelKo } from '@/lib/mergedDeskStructurePhaseKo';
import { snapMergedOverlayTimeToCandles } from '@/lib/mergedAnalysisOverlayTimes';

function snapT(candles: Candle[], t: number): number {
  return Number(snapMergedOverlayTimeToCandles(t, candles));
}

function structLine(
  id: string,
  tag: 'BOS' | 'CHOCH',
  price: number,
  t1: number,
  t2: number,
  bias: 'bullish' | 'bearish',
  phase: string
): OverlayItem {
  const bull = bias === 'bullish';
  const color = bull ? 'rgba(34,197,94,0.82)' : 'rgba(239,68,68,0.82)';
  return {
    id,
    kind: tag === 'CHOCH' ? 'choch' : 'bos',
    label: '',
    x1: 0,
    y1: price,
    x2: 1,
    y2: price,
    time1: t1 as UTCTimestamp,
    time2: t2 as UTCTimestamp,
    price1: price,
    price2: price,
    confidence: 0.78,
    color,
    lineLabelColor: color,
    lineDash: phase === 'confirmed' ? undefined : '6 4',
    lineStrokeWidth: phase === 'confirmed' ? 2.2 : 1.6,
    category: 'structure',
    structureBias: bias,
    noProject: true,
    overlayZoneExtraClass: `merged-ares-mlsp-tv-struct-${tag.toLowerCase()}`,
    labelTooltip: `${tag === 'CHOCH' ? chochMarkerLabelKo(phase) : tag} — 구조 레벨`,
  };
}

function targetLine(
  label: string,
  price: number,
  t1: number,
  t2: number,
  up: boolean
): OverlayItem {
  return {
    id: `merged-ares-mlsp-tv-target-${label.toLowerCase()}-${Math.round(price)}`,
    kind: 'keyLevel',
    label: '',
    x1: 0,
    y1: price,
    x2: 1,
    y2: price,
    time1: t1 as UTCTimestamp,
    time2: t2 as UTCTimestamp,
    price1: price,
    price2: price,
    confidence: 0.72,
    color: up ? 'rgba(45,212,191,0.55)' : 'rgba(251,146,60,0.55)',
    lineLabelColor: up ? '#2dd4bf' : '#fb923c',
    lineDash: label === 'Tmax' ? '4 4' : '10 6',
    lineStrokeWidth: label === 'T1' ? 2 : 1.5,
    category: 'structure',
    noProject: true,
    overlayZoneExtraClass: `merged-ares-mlsp-tv-target-line merged-ares-smc-bounce-line merged-ares-smc-bounce-line--${label.toLowerCase()}`,
    labelTooltip: `${label} 목표 — 조건부 참고`,
  };
}

function zoneOverlap(aBot: number, aTop: number, bBot: number, bTop: number): number {
  return Math.max(0, Math.min(aTop, bTop) - Math.max(aBot, bBot));
}

export function buildMergedDeskMirageEnhanceOverlays(params: {
  candles: Candle[];
  smcLeading?: MergedSmcLeadingContext | null;
  keyZones?: MergedKeyZone[];
  criticalZones?: MergedCriticalZone[];
  currentPrice?: number | null;
}): OverlayItem[] {
  const { candles, smcLeading, keyZones = [], criticalZones = [], currentPrice } = params;
  const n = candles.length;
  if (n < 8) return [];

  const t1 = snapT(candles, Number(candles[Math.max(0, n - 48)]!.time));
  const t2 = snapT(candles, Number(candles[n - 1]!.time));
  const out: OverlayItem[] = [];

  const marks = smcLeading?.marks ?? [];
  const lastChoch = smcLeading?.lastChoch ?? marks.filter((m) => m.tag === 'CHOCH').slice(-1)[0];
  const lastBos = marks.filter((m) => m.tag === 'BOS').slice(-1)[0];

  if (lastChoch && Number.isFinite(lastChoch.price)) {
    out.push(
      structLine(
        `merged-ares-mlsp-tv-struct-choch-${lastChoch.index}`,
        'CHOCH',
        lastChoch.price,
        snapT(candles, lastChoch.time),
        t2,
        lastChoch.bias,
        String(lastChoch.phase || 'breakout')
      )
    );
  }
  if (lastBos && Number.isFinite(lastBos.price) && lastBos.index !== lastChoch?.index) {
    out.push(
      structLine(
        `merged-ares-mlsp-tv-struct-bos-${lastBos.index}`,
        'BOS',
        lastBos.price,
        snapT(candles, lastBos.time),
        t2,
        lastBos.bias,
        String(lastBos.phase || 'breakout')
      )
    );
  }

  const hint = smcLeading?.bounceHint;
  if (hint) {
    const up = hint.direction === 'up';
    for (const [label, px] of [
      ['T1', hint.t1],
      ['T2', hint.t2],
      ['Tmax', hint.tmax],
    ] as const) {
      if (Number.isFinite(px) && px > 0) {
        out.push(targetLine(label, px, t1, t2, up));
      }
    }
  }

  const price = currentPrice ?? candles[n - 1]!.close;
  let best: { score: number; top: number; bot: number; label: string } | null = null;

  for (const k of keyZones.slice(0, 8)) {
    for (const c of criticalZones.slice(0, 8)) {
      if (k.kind !== c.kind) continue;
      const ov = zoneOverlap(k.bot, k.top, c.bot, c.top);
      if (ov <= 0) continue;
      const top = Math.min(k.top, c.top);
      const bot = Math.max(k.bot, c.bot);
      const center = (top + bot) / 2;
      const dist = Math.abs(price - center) / Math.max(price, 1);
      const score = ov / Math.max(top - bot, 1e-9) + (c.confluenceCount ?? 0) * 0.15 - dist * 0.5;
      const label = `합류·${k.labelKo ?? k.kind}`;
      if (!best || score > best.score) {
        best = { score, top, bot, label };
      }
    }
  }

  if (best && best.top > best.bot) {
    out.push({
      id: 'merged-ares-mlsp-tv-confluence-zone-0',
      kind: 'zone',
      label: '',
      x1: 0,
      y1: 0,
      x2: 1,
      y2: 0,
      time1: t1 as UTCTimestamp,
      time2: t2 as UTCTimestamp,
      price1: best.top,
      price2: best.bot,
      confidence: 0.8,
      color: 'rgba(250,204,21,0.14)',
      category: 'mirageLSP',
      zoneFillPreserve: true,
      overlayZoneExtraClass:
        'merged-ares-mlsp-tv-confluence-zone merged-ares-mlsp-tv-zone-face',
      labelTooltip: `${best.label} — key+critical 겹침`,
    });
  }

  return out;
}
