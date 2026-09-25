/**
 * assets 353 AI — 라이브 캔들(OHLCV)에 353 지식·플레이북 기반 자동 작도.
 * 이미지 픽셀/좌표 추출 없음.
 */
import type { AnalyzeResponse, Candle, OverlayItem } from '@/types';
import type { PatternVisionResult } from '@/types/patternVision';
import type { MergedSmcLeadingContext } from '@/lib/mergedAnalysisSmcLeading';
import type { UnifiedDeskTradePlan } from '@/lib/unifiedDeskTradePlan';
import type { Assets353Direction, Assets353Verdict } from '@/lib/assets353CandleKnowledgeEngine';
import type { Assets353PlaybookDraw } from '@/lib/assets353Playbooks';
import { getDominantPattern, runPatternVision } from '@/lib/patternVision/patternVisionEngine';
import { snapMergedOverlayTimeToCandles } from '@/lib/mergedAnalysisOverlayTimes';
import { OVERLAY_COLORS } from '@/lib/overlayColors';

type LiveFvg = { top: number; bot: number; time: number; bias: 'bullish' | 'bearish' };

function pivotLows(candles: Candle[], wing = 2): Array<{ idx: number; price: number; time: number }> {
  const out: Array<{ idx: number; price: number; time: number }> = [];
  for (let i = wing; i < candles.length - wing; i++) {
    let ok = true;
    for (let j = 1; j <= wing; j++) {
      if (candles[i]!.low >= candles[i - j]!.low || candles[i]!.low >= candles[i + j]!.low) {
        ok = false;
        break;
      }
    }
    if (ok) out.push({ idx: i, price: candles[i]!.low, time: Number(candles[i]!.time) });
  }
  return out;
}

function pivotHighs(candles: Candle[], wing = 2): Array<{ idx: number; price: number; time: number }> {
  const out: Array<{ idx: number; price: number; time: number }> = [];
  for (let i = wing; i < candles.length - wing; i++) {
    let ok = true;
    for (let j = 1; j <= wing; j++) {
      if (candles[i]!.high <= candles[i - j]!.high || candles[i]!.high <= candles[i + j]!.high) {
        ok = false;
        break;
      }
    }
    if (ok) out.push({ idx: i, price: candles[i]!.high, time: Number(candles[i]!.time) });
  }
  return out;
}

function tWin(candles: Candle[], startBars = 48): { t1: number; t2: number } {
  const n = candles.length;
  const t2 = Number(candles[n - 1]!.time);
  const t1 = snapMergedOverlayTimeToCandles(
    Number(candles[Math.max(0, n - startBars)]!.time),
    candles
  );
  return { t1, t2 };
}

function detectLiveFvgs(candles: Candle[], lookback = 90): LiveFvg[] {
  const out: LiveFvg[] = [];
  const start = Math.max(2, candles.length - lookback);
  for (let i = start; i < candles.length; i++) {
    const c0 = candles[i - 2]!;
    const c2 = candles[i]!;
    if (c0.high < c2.low) {
      out.push({
        top: c2.low,
        bot: c0.high,
        time: Number(c2.time),
        bias: 'bullish',
      });
    }
    if (c0.low > c2.high) {
      out.push({
        top: c0.low,
        bot: c2.high,
        time: Number(c2.time),
        bias: 'bearish',
      });
    }
  }
  return out.slice(-4);
}

function detectLiquidityLevels(candles: Candle[], tolPct = 0.0018): Array<{ price: number; bias: 'bullish' | 'bearish'; time: number }> {
  const slice = candles.slice(-80);
  const out: Array<{ price: number; bias: 'bullish' | 'bearish'; time: number }> = [];
  const highs = pivotHighs(slice, 2);
  const lows = pivotLows(slice, 2);

  for (let i = 0; i < highs.length; i++) {
    for (let j = i + 1; j < highs.length; j++) {
      const a = highs[i]!;
      const b = highs[j]!;
      const mid = (a.price + b.price) / 2;
      if (mid > 0 && Math.abs(a.price - b.price) / mid <= tolPct) {
        out.push({ price: mid, bias: 'bearish', time: b.time });
      }
    }
  }
  for (let i = 0; i < lows.length; i++) {
    for (let j = i + 1; j < lows.length; j++) {
      const a = lows[i]!;
      const b = lows[j]!;
      const mid = (a.price + b.price) / 2;
      if (mid > 0 && Math.abs(a.price - b.price) / mid <= tolPct) {
        out.push({ price: mid, bias: 'bullish', time: b.time });
      }
    }
  }
  return out.slice(-3);
}

function patternAtOffset(candles: Candle[], visible: Candle[], globalIdx: number): number {
  const visStart = candles.length - visible.length;
  return Math.max(0, Math.min(visible.length - 1, globalIdx - visStart));
}

function lineToOverlay(
  line: { startIndex: number; startPrice: number; endIndex: number; endPrice: number; role: string },
  candles: Candle[],
  visible: Candle[],
  id: string,
  label: string
): OverlayItem | null {
  const si = patternAtOffset(candles, visible, line.startIndex);
  const ei = patternAtOffset(candles, visible, line.endIndex);
  if (si >= visible.length || ei >= visible.length) return null;
  const t1 = snapMergedOverlayTimeToCandles(Number(visible[si]!.time), candles);
  const t2 = snapMergedOverlayTimeToCandles(Number(visible[ei]!.time), candles);
  const kind =
    line.role === 'neckline'
      ? 'keyLevel'
      : line.role === 'entry'
        ? 'entry'
        : line.role === 'stop'
          ? 'stop'
          : line.role === 'target'
            ? 'target'
            : 'trendLine';
  return {
    id,
    kind,
    label,
    x1: 0,
    y1: 0,
    time1: t1,
    time2: t2,
    price1: line.startPrice,
    price2: line.endPrice,
    confidence: 0.74,
    lineDash: line.role === 'neckline' ? '5 4' : undefined,
    category: 'assetsChartAi',
    overlayZoneExtraClass: `merged-desk-super-ai merged-desk-super-ai-pattern-${line.role}`,
  };
}

export function buildAssets353LiveDrawOverlays(params: {
  candles: Candle[];
  direction: Assets353Direction;
  verdict: Assets353Verdict;
  drawFlags: Assets353PlaybookDraw;
  smcLeading?: MergedSmcLeadingContext | null;
  tradePlan?: UnifiedDeskTradePlan | null;
  analysis?: AnalyzeResponse | null;
  topPlaybookLabel?: string;
}): OverlayItem[] {
  const { candles, direction, verdict, drawFlags, smcLeading, tradePlan, analysis } = params;
  const n = candles.length;
  if (n < 24) return [];

  const { t1, t2 } = tWin(candles);
  const last = candles[n - 1]!;
  const slice = candles.slice(-100);
  const lows = pivotLows(slice, 2);
  const highs = pivotHighs(slice, 2);
  const support = lows.length ? lows[lows.length - 1]!.price : last.low;
  const resistance = highs.length ? highs[highs.length - 1]!.price : last.high;
  const pad = last.close * 0.0035;
  const out: OverlayItem[] = [];
  let cap = 22;

  const push = (o: OverlayItem) => {
    if (out.length >= cap) return;
    out.push({
      ...o,
      category: 'assetsChartAi',
      overlayZoneExtraClass: `merged-desk-super-ai merged-desk-super-ai-live ${o.overlayZoneExtraClass || ''}`.trim(),
    });
  };

  if (drawFlags.demandZone && direction !== 'SHORT') {
    push({
      id: 'merged-desk-super-ai-knowledge-demand',
      kind: 'zone',
      label: 'SUP',
      x1: 0,
      y1: 0,
      time1: t1,
      time2: t2,
      price1: support + pad,
      price2: support - pad,
      confidence: 0.82,
      color: 'rgba(34,197,94,0.2)',
      zoneFillPreserve: true,
      overlayZoneExtraClass: 'merged-desk-super-ai-live-demand',
    });
  }

  if (drawFlags.supplyZone && direction !== 'LONG') {
    push({
      id: 'merged-desk-super-ai-knowledge-supply',
      kind: 'zone',
      label: 'RES',
      x1: 0,
      y1: 0,
      time1: t1,
      time2: t2,
      price1: resistance + pad,
      price2: resistance - pad,
      confidence: 0.82,
      color: 'rgba(239,68,68,0.16)',
      zoneFillPreserve: true,
      overlayZoneExtraClass: 'merged-desk-super-ai-live-supply',
    });
  }

  if (drawFlags.ob && smcLeading?.obs?.length) {
    for (const ob of smcLeading.obs.slice(-2)) {
      push({
        id: `merged-desk-super-ai-knowledge-ob-${ob.id}`,
        kind: 'zone',
        label: ob.bias === 'bullish' ? 'OB↑' : 'OB↓',
        x1: 0,
        y1: 0,
        time1: snapMergedOverlayTimeToCandles(ob.time, candles),
        time2: t2,
        price1: ob.high,
        price2: ob.low,
        confidence: 0.78,
        color: ob.bias === 'bullish' ? 'rgba(34,197,94,0.14)' : 'rgba(239,68,68,0.12)',
        zoneFillPreserve: true,
        overlayZoneExtraClass: `merged-desk-super-ai-ob-${ob.bias}`,
      });
    }
  }

  if (drawFlags.structureMark) {
    const ch = smcLeading?.lastChoch;
    if (ch && Number.isFinite(ch.price)) {
      push({
        id: 'merged-desk-super-ai-knowledge-choch',
        kind: ch.tag === 'BOS' ? 'bos' : 'choch',
        label: ch.tag === 'BOS' ? 'BOS' : 'CH',
        x1: 0,
        y1: 0,
        time1: snapMergedOverlayTimeToCandles(ch.time, candles),
        time2: t2,
        price1: ch.price,
        price2: ch.price,
        confidence: 0.8,
        lineDash: '5 4',
      });
    }
    const recentMarks = smcLeading?.marks?.filter((m) => m.tag === 'BOS').slice(-2) ?? [];
    for (const m of recentMarks) {
      push({
        id: `merged-desk-super-ai-knowledge-bos-${m.index}`,
        kind: 'bos',
        label: 'BOS',
        x1: 0,
        y1: 0,
        time1: snapMergedOverlayTimeToCandles(m.time, candles),
        time2: t2,
        price1: m.price,
        price2: m.price,
        confidence: 0.76,
        lineDash: '4 3',
      });
    }
  }

  if (drawFlags.fvg) {
    const fvgs = detectLiveFvgs(candles);
    const wantBias = direction === 'LONG' ? 'bullish' : direction === 'SHORT' ? 'bearish' : null;
    for (const [i, fvg] of fvgs.entries()) {
      if (wantBias && fvg.bias !== wantBias) continue;
      push({
        id: `merged-desk-super-ai-knowledge-fvg-${i}`,
        kind: 'zone',
        label: 'FVG',
        x1: 0,
        y1: 0,
        time1: snapMergedOverlayTimeToCandles(fvg.time, candles),
        time2: t2,
        price1: fvg.top,
        price2: fvg.bot,
        confidence: 0.72,
        color: fvg.bias === 'bullish' ? 'rgba(56,189,248,0.12)' : 'rgba(251,146,60,0.12)',
        zoneFillPreserve: true,
        overlayZoneExtraClass: 'merged-desk-super-ai-fvg',
      });
    }
  }

  if (drawFlags.liquidity) {
    for (const [i, liq] of detectLiquidityLevels(candles).entries()) {
      push({
        id: `merged-desk-super-ai-knowledge-liq-${i}`,
        kind: 'keyLevel',
        label: liq.bias === 'bullish' ? 'EQL' : 'EQH',
        x1: 0,
        y1: 0,
        time1: t1,
        time2: t2,
        price1: liq.price,
        price2: liq.price,
        confidence: 0.7,
        lineDash: '2 6',
        color: 'rgba(148,163,184,0.55)',
      });
    }
  }

  const visible = candles.slice(-Math.min(n, 120));
  const patterns = analysis?.detectedVisionPatterns?.length
    ? (analysis.detectedVisionPatterns as PatternVisionResult[])
    : runPatternVision(visible);
  const dom = getDominantPattern(patterns);

  if (dom) {
    if (drawFlags.neckLine) {
      const neck = dom.lines.find((l) => l.role === 'neckline');
      if (neck) {
        const o = lineToOverlay(neck, candles, visible, 'merged-desk-super-ai-knowledge-neck', 'Neck');
        if (o) push(o);
      }
    }
    if (drawFlags.patternLines) {
      for (const [i, line] of dom.lines.filter((l) => l.role === 'support' || l.role === 'resistance').slice(0, 2).entries()) {
        const o = lineToOverlay(
          line,
          candles,
          visible,
          `merged-desk-super-ai-knowledge-patline-${i}`,
          line.role === 'support' ? 'SUP' : 'RES'
        );
        if (o) push(o);
      }
    }
    if (dom.targets?.length) {
      for (const t of dom.targets.slice(0, 3)) {
        const kind = t.type === 'entry' ? 'entry' : t.type === 'sl' ? 'stop' : 'target';
        push({
          id: `merged-desk-super-ai-knowledge-pat-${t.type}`,
          kind,
          label: t.type.toUpperCase(),
          x1: 0,
          y1: 0,
          time1: t1,
          time2: t2,
          price1: t.price,
          price2: t.price,
          confidence: dom.confidence / 100,
          color:
            kind === 'entry'
              ? OVERLAY_COLORS.entry
              : kind === 'stop'
                ? OVERLAY_COLORS.stop
                : OVERLAY_COLORS.target,
        });
      }
    }
  }

  const hasPlan = (tradePlan?.entry ?? 0) > 0 && tradePlan?.direction !== 'NEUTRAL';
  if (drawFlags.entrySlTp && !hasPlan && direction !== 'NEUTRAL') {
    const entry = direction === 'LONG' ? support + pad * 0.5 : resistance - pad * 0.5;
    const stop = direction === 'LONG' ? support - pad * 2 : resistance + pad * 2;
    const risk = Math.abs(entry - stop);
    const tp = direction === 'LONG' ? entry + risk * 2 : entry - risk * 2;
    push({
      id: 'merged-desk-super-ai-knowledge-entry',
      kind: 'entry',
      label: 'Entry',
      x1: 0,
      y1: 0,
      time1: t1,
      time2: t2,
      price1: entry,
      price2: entry,
      color: OVERLAY_COLORS.entry,
      confidence: 0.74,
    });
    push({
      id: 'merged-desk-super-ai-knowledge-stop',
      kind: 'stop',
      label: 'SL',
      x1: 0,
      y1: 0,
      time1: t1,
      time2: t2,
      price1: stop,
      price2: stop,
      color: OVERLAY_COLORS.stop,
      confidence: 0.74,
    });
    push({
      id: 'merged-desk-super-ai-knowledge-tp',
      kind: 'target',
      label: 'TP',
      x1: 0,
      y1: 0,
      time1: t1,
      time2: t2,
      price1: tp,
      price2: tp,
      color: OVERLAY_COLORS.target,
      confidence: 0.74,
    });
  }

  if (verdict.invalidationPrice != null && direction !== 'NEUTRAL') {
    push({
      id: 'merged-desk-super-ai-knowledge-invalidation',
      kind: 'keyLevel',
      label: 'INV',
      x1: 0,
      y1: 0,
      time1: t1,
      time2: t2,
      price1: verdict.invalidationPrice,
      price2: verdict.invalidationPrice,
      confidence: 0.76,
      lineDash: '8 4',
      color: 'rgba(251,191,36,0.75)',
    });
  }

  const topScenario = verdict.topMatches[0]?.scenarioKo;
  const voteTag = `L${verdict.longPct}/S${verdict.shortPct}`;
  push({
    id: 'merged-desk-super-ai-knowledge-verdict-label',
    kind: 'label',
    label:
      direction === 'LONG'
        ? `▲롱 ${verdict.longPct}`
        : direction === 'SHORT'
          ? `▼숏 ${verdict.shortPct}`
          : `◆대기 ${voteTag}`,
    x1: 0,
    y1: 0,
    time1: t2,
    price1: last.high * 1.0015,
    confidence: verdict.confidencePct / 100,
    labelBackgroundColor:
      direction === 'LONG'
        ? 'rgba(6,78,59,0.94)'
        : direction === 'SHORT'
          ? 'rgba(127,29,29,0.94)'
          : 'rgba(51,65,85,0.94)',
    labelTextColor: '#f8fafc',
    overlayZoneExtraClass: 'merged-desk-super-ai-head-label',
  });

  if (params.topPlaybookLabel || topScenario) {
    const sub =
      params.topPlaybookLabel && topScenario
        ? `353 ${params.topPlaybookLabel} · ${topScenario.slice(0, 28)}`
        : params.topPlaybookLabel
          ? `353 · ${params.topPlaybookLabel}`
          : topScenario!.slice(0, 32);
    push({
      id: 'merged-desk-super-ai-knowledge-playbook-label',
      kind: 'label',
      label: sub,
      x1: 0,
      y1: 0,
      time1: snapMergedOverlayTimeToCandles(t1, candles),
      price1: last.close,
      confidence: 0.65,
      labelBackgroundColor: 'rgba(15,23,42,0.88)',
      labelTextColor: '#a78bfa',
      overlayZoneExtraClass: 'merged-desk-super-ai-playbook-label',
    });
  }

  return out;
}
