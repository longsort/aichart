import type { OverlayItem } from '@/types';

const ALLOWED_KINDS = new Set(['zone', 'keyLevel', 'entry', 'stop', 'target', 'label', 'trendLine']);

export type CandleAnalysisAiDrawBundle = {
  overlays: OverlayItem[];
  commentary: string[];
  bias: 'LONG' | 'SHORT' | 'NEUTRAL';
  supportHoldRefPct: number | null;
  resistanceRefPct: number | null;
};

function num(x: unknown): number | null {
  const n = typeof x === 'number' ? x : parseFloat(String(x ?? ''));
  return Number.isFinite(n) ? n : null;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function clampPrice(p: number, lastClose: number): number {
  if (!(lastClose > 0)) return p;
  const lo = lastClose * 0.2;
  const hi = lastClose * 5;
  return clamp(p, lo, hi);
}

/** API / 모델 출력 → 차트용 오버레이 (최대 max 개, 가격 클램프) */
export function normalizeCandleAnalysisAiDrawResponse(
  raw: unknown,
  tFirst: number,
  tLast: number,
  lastClose: number,
  opts?: { maxOverlays?: number; barSec?: number }
): CandleAnalysisAiDrawBundle {
  const maxO = Math.max(4, Math.min(16, opts?.maxOverlays ?? 12));
  const empty = (): CandleAnalysisAiDrawBundle => ({
    overlays: [],
    commentary: [],
    bias: 'NEUTRAL',
    supportHoldRefPct: null,
    resistanceRefPct: null,
  });
  if (!raw || typeof raw !== 'object') return empty();
  const o = raw as Record<string, unknown>;

  const biasRaw = String(o.bias || 'NEUTRAL').toUpperCase();
  const bias: 'LONG' | 'SHORT' | 'NEUTRAL' =
    biasRaw === 'LONG' || biasRaw === 'SHORT' ? biasRaw : 'NEUTRAL';

  const sup = num(o.support_hold_ref_pct);
  const res = num(o.resistance_ref_pct);
  const supportHoldRefPct = sup != null ? clamp(Math.round(sup), 0, 100) : null;
  const resistanceRefPct = res != null ? clamp(Math.round(res), 0, 100) : null;

  const comm = o.commentary;
  const commentary: string[] = Array.isArray(comm)
    ? comm.map((x) => String(x || '').trim()).filter(Boolean).slice(0, 8)
    : [];

  const arr = o.overlays;
  if (!Array.isArray(arr)) return { overlays: [], commentary, bias, supportHoldRefPct, resistanceRefPct };

  const overlays: OverlayItem[] = [];
  let idx = 0;

  for (const item of arr) {
    if (overlays.length >= maxO) break;
    if (!item || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    const kind = String(r.kind || '').trim();
    if (!ALLOWED_KINDS.has(kind)) continue;

    const label = String(r.label || 'AI').trim().slice(0, 80) || 'AI';
    const id = `candle-analysis-ai-draw-${idx++}`;

    if (kind === 'zone') {
      const top = num(r.priceTop ?? r.price1 ?? r.high);
      const bot = num(r.priceBottom ?? r.price2 ?? r.low);
      if (top == null || bot == null) continue;
      const hi = clampPrice(Math.max(top, bot), lastClose);
      const lo = clampPrice(Math.min(top, bot), lastClose);
      if (Math.abs(hi - lo) < (lastClose > 0 ? lastClose * 3e-5 : 1e-8)) continue;
      const isSup = /지지|수요|support|demand/i.test(label);
      overlays.push({
        id,
        kind: 'zone',
        label,
        x1: 0,
        y1: 0,
        x2: 1,
        y2: 1,
        time1: tFirst,
        time2: tLast,
        price1: hi,
        price2: lo,
        confidence: clamp(Math.round(num(r.confidence) ?? 62), 40, 90),
        color: isSup ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.18)',
        lineLabelColor: isSup ? '#4ade80' : '#fb7185',
        category: 'aiAuto',
        labelTooltip: 'AI 작도(참고·비조언)',
      });
      continue;
    }

    if (kind === 'trendLine') {
      const p1 = num(r.price1 ?? r.p1);
      const p2 = num(r.price2 ?? r.p2);
      if (p1 == null || p2 == null) continue;
      const bars1 = Math.round(num(r.barOffset1) ?? num(r.tOffsetBars1) ?? 0);
      const bars2 = Math.round(num(r.barOffset2) ?? num(r.tOffsetBars2) ?? 8);
      const bs =
        opts?.barSec && opts.barSec > 0 ? opts.barSec : Math.max(60, Math.floor((tLast - tFirst) / Math.max(16, maxO)));
      const t1 = tLast + bars1 * bs;
      const t2 = tLast + bars2 * bs;
      overlays.push({
        id,
        kind: 'trendLine',
        label,
        x1: 0,
        y1: 0,
        time1: t1,
        price1: clampPrice(p1, lastClose),
        time2: t2,
        price2: clampPrice(p2, lastClose),
        confidence: 55,
        color: 'rgba(167,139,250,0.75)',
        lineDash: '6 5',
        lineStrokeWidth: 1.35,
        category: 'aiAuto',
        noProject: true,
        labelTooltip: 'AI 작도(참고)',
      });
      continue;
    }

    const price = num(r.price ?? r.price1);
    if (price == null) continue;
    const px = clampPrice(price, lastClose);

    if (kind === 'label') {
      overlays.push({
        id,
        kind: 'label',
        label,
        x1: 0,
        y1: 0,
        time1: tLast,
        price1: px,
        confidence: 58,
        color: '#a78bfa',
        category: 'aiAuto',
        labelBackgroundColor: 'rgba(15,23,42,0.75)',
        labelTextColor: '#e2e8f0',
        labelTooltip: 'AI 작도(참고)',
      });
      continue;
    }

    const mapKind = kind === 'keyLevel' || kind === 'entry' || kind === 'stop' || kind === 'target' ? kind : 'keyLevel';
    const color =
      mapKind === 'stop'
        ? 'rgba(248,113,113,0.5)'
        : mapKind === 'target'
          ? 'rgba(74,222,128,0.5)'
          : mapKind === 'entry'
            ? 'rgba(250,204,21,0.52)'
            : 'rgba(147,197,253,0.48)';
    const lineC =
      mapKind === 'stop' ? '#f87171' : mapKind === 'target' ? '#4ade80' : mapKind === 'entry' ? '#facc15' : '#93c5fd';

    overlays.push({
      id,
      kind: mapKind as OverlayItem['kind'],
      label,
      x1: 0,
      y1: 0,
      x2: 1,
      y2: 0,
      time1: tFirst,
      time2: tLast,
      price1: px,
      price2: px,
      confidence: clamp(Math.round(num(r.confidence) ?? 68), 45, 92),
      color,
      lineLabelColor: lineC,
      lineStrokeWidth: mapKind === 'stop' || mapKind === 'target' ? 1.65 : 1.45,
      category: 'aiAuto',
      labelTooltip: 'AI 작도(참고·비조언)',
    });
  }

  return { overlays, commentary, bias, supportHoldRefPct, resistanceRefPct };
}

export function stripJsonFence(text: string): string {
  let s = text.trim();
  if (s.startsWith('```')) {
    s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '');
  }
  return s.trim();
}
