import type { Candle, OverlayItem } from '@/types';

function candleMinMax(candles: Candle[]): { min: number; max: number } {
  let min = Infinity;
  let max = -Infinity;
  for (const c of candles) {
    min = Math.min(min, c.low);
    max = Math.max(max, c.high);
  }
  return { min, max };
}

function toRatio(price: number, min: number, max: number): number {
  const r = Math.max(1e-9, max - min);
  return (max - price) / r;
}

function normFromIndex(i: number, n: number): number {
  if (n <= 1) return 0;
  return Math.max(0, Math.min(1, i / (n - 1)));
}

function indexFromNorm(x: number, n: number): number {
  if (n <= 1) return 0;
  return Math.round(Math.max(0, Math.min(1, x)) * (n - 1));
}

function nearestTimeIndex(candles: Candle[], t: unknown): number {
  if (!candles.length) return 0;
  if (t == null) return 0;
  const tt = Number(t);
  if (!Number.isFinite(tt)) return 0;
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < candles.length; i++) {
    const d = Math.abs(Number(candles[i].time) - tt);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

/**
 * Vision 패턴 존·선을 **현재 차트 캔들**에 맞춤:
 * - 존: 좌측은 유지, 우측은 **마지막 봉**까지 연장, 상·하단은 구간 내 실제 고·저에 스냅
 * - 선: 끝점을 마지막 봉까지 **동일 기울**로 연장(가격 선형 보간)
 */
export function adjustPatternVisionOverlayGeometry(items: OverlayItem[], candles: Candle[]): OverlayItem[] {
  const n = candles.length;
  if (n < 2 || !items.length) return items;
  const { min, max } = candleMinMax(candles);
  if (!Number.isFinite(min) || !Number.isFinite(max)) return items;
  const lastIdx = n - 1;
  const lastTime = candles[lastIdx]?.time;

  return items.map((raw) => {
    const cat = String((raw as { category?: string }).category || '');
    if (cat !== 'patternVision') return raw;

    const o = { ...raw } as OverlayItem & Record<string, unknown>;
    const kind = String(o.kind || '');

    if (kind === 'zone') {
      const li = indexFromNorm(Number(o.x1 ?? 0), n);
      const ri0 = indexFromNorm(Number(o.x2 ?? 0), n);
      let left = Math.min(li, ri0);
      let right = Math.max(li, ri0);
      right = lastIdx;
      let top = -Infinity;
      let bot = Infinity;
      for (let i = left; i <= right; i++) {
        const c = candles[i];
        if (!c) continue;
        top = Math.max(top, c.high);
        bot = Math.min(bot, c.low);
      }
      if (!Number.isFinite(top) || !Number.isFinite(bot)) return raw;
      o.x1 = normFromIndex(left, n);
      o.x2 = normFromIndex(right, n);
      o.y1 = toRatio(top, min, max);
      o.y2 = toRatio(bot, min, max);
      o.time1 = candles[left]?.time;
      o.time2 = typeof lastTime === 'number' ? lastTime : o.time2;
      o.price1 = Math.max(top, bot);
      o.price2 = Math.min(top, bot);
      return o as OverlayItem;
    }

    const lineKinds = new Set(['supportLine', 'resistanceLine', 'trendLine', 'entry', 'stop', 'target']);
    if (!lineKinds.has(kind)) return raw;

    const p1 = Number(o.price1);
    const p2 = Number(o.price2);
    if (!Number.isFinite(p1) || !Number.isFinite(p2)) return raw;

    let ia = nearestTimeIndex(candles, o.time1);
    let ib = nearestTimeIndex(candles, o.time2);
    if (ib < ia) {
      const s = ia;
      ia = ib;
      ib = s;
    }

    if (ib >= lastIdx) {
      o.x1 = normFromIndex(ia, n);
      o.x2 = normFromIndex(ib, n);
      o.y1 = toRatio(p1, min, max);
      o.y2 = toRatio(p2, min, max);
      return o as OverlayItem;
    }

    let newP = p2;
    if (ib !== ia) {
      newP = p1 + ((p2 - p1) * (lastIdx - ia)) / (ib - ia);
    } else {
      newP = p1;
    }
    o.x1 = normFromIndex(ia, n);
    o.x2 = normFromIndex(lastIdx, n);
    o.y1 = toRatio(p1, min, max);
    o.y2 = toRatio(newP, min, max);
    o.time2 = typeof lastTime === 'number' ? lastTime : o.time2;
    o.price2 = newP;
    return o as OverlayItem;
  });
}
