import type { Candle, OverlayItem } from '@/types';

/** 반감기(봉 수) — 오래된 OB일수록 생존 점수 감쇠 */
export const MSB_OB_DECAY_HALF_LIFE_BARS = 44;
/** 동시에 그릴 Bu/Be-OB 상한 (밀도 자동) */
export const MSB_OB_MAX_VISIBLE = 12;

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function zoneBounds(o: OverlayItem): { lo: number; hi: number } | null {
  const p1 = o.price1 ?? o.y1;
  const p2 = o.price2 ?? o.y2;
  if (typeof p1 !== 'number' || typeof p2 !== 'number' || !Number.isFinite(p1) || !Number.isFinite(p2)) return null;
  return { lo: Math.min(p1, p2), hi: Math.max(p1, p2) };
}

function adjustRgbaAlpha(color: string | undefined, mult: number): string | undefined {
  if (!color) return color;
  const m = color.trim().match(/^rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)$/i);
  if (!m) return color;
  const a = clamp(Number(m[4]) * mult, 0.04, 0.92);
  return `rgba(${m[1]},${m[2]},${m[3]},${a})`;
}

function baseObLabel(id: string): string {
  if (id.startsWith('whale-auto-bu-ob')) return 'Bu-OB';
  if (id.startsWith('whale-auto-be-ob')) return 'Be-OB';
  return 'OB';
}

function candleIndexAtOrAfter(candles: Candle[], t: number): number {
  for (let i = 0; i < candles.length; i++) {
    if ((candles[i].time as number) >= t) return i;
  }
  return Math.max(0, candles.length - 1);
}

function isWhaleBuObId(id: string): boolean {
  return id.startsWith('whale-auto-bu-ob');
}

function isWhaleBeObId(id: string): boolean {
  return id.startsWith('whale-auto-be-ob');
}

export function isWhaleMsbObOverlay(o: OverlayItem): boolean {
  const id = o.id;
  return isWhaleBuObId(id) || isWhaleBeObId(id);
}

/**
 * MSB-OB 전용: 미티게이션(완전/부분)·시간 감쇠 생존 점수·라벨 접미사·투명도·상위 N 유지.
 * pre3-match-zone 은 항상 유지(강화만 선택 적용).
 */
export function enhanceMsbObDevOverlays(overlays: OverlayItem[], candles: Candle[]): OverlayItem[] {
  if (!overlays.length || !candles.length) return overlays;
  const lastI = candles.length - 1;
  const pre3 = overlays.filter((o) => o.id === 'pre3-match-zone');
  const whale = overlays.filter((o) => isWhaleMsbObOverlay(o));
  const other = overlays.filter((o) => o.id !== 'pre3-match-zone' && !isWhaleMsbObOverlay(o));

  const scored = whale.map((o) => {
    const id = o.id;
    const bu = isWhaleBuObId(id);
    const bounds = zoneBounds(o);
    const tForm = Number(o.time1 ?? 0);
    let startI = 0;
    if (Number.isFinite(tForm) && tForm > 0) {
      let found = -1;
      for (let i = 0; i < candles.length; i++) {
        if ((candles[i].time as number) === tForm) {
          found = i;
          break;
        }
      }
      startI = found >= 0 ? found : candleIndexAtOrAfter(candles, tForm);
    } else {
      startI = lastI;
    }
    startI = clamp(startI, 0, lastI);

    let fullMit = false;
    let partialMit = false;
    if (bounds) {
      for (let i = startI + 1; i <= lastI; i++) {
        const c = candles[i];
        const cl = Number(c.close);
        const hi = Number(c.high);
        const lo = Number(c.low);
        if (bu) {
          if (cl < bounds.lo) {
            fullMit = true;
            break;
          }
          if (lo < bounds.lo && cl >= bounds.lo) partialMit = true;
        } else {
          if (cl > bounds.hi) {
            fullMit = true;
            break;
          }
          if (hi > bounds.hi && cl <= bounds.hi) partialMit = true;
        }
      }
    }

    const barsAgo = Math.max(0, lastI - startI);
    const decay = Math.exp(-barsAgo / MSB_OB_DECAY_HALF_LIFE_BARS);
    let survival = Math.round(100 * decay);
    if (fullMit) survival = Math.round(survival * 0.28);
    else if (partialMit) survival = Math.round(survival * 0.72);
    survival = clamp(survival, 8, 100);

    const conf = Number(o.confidence ?? 72);
    const rankScore = conf * 0.52 + survival * 0.48;

    let alphaMul = 0.22 + 0.78 * (survival / 100);
    if (fullMit) alphaMul *= 0.38;
    else if (partialMit) alphaMul *= 0.68;

    const base = baseObLabel(id);
    let labelSuffix: string;
    if (fullMit) labelSuffix = '소진';
    else if (partialMit) labelSuffix = `부분·${survival}`;
    else labelSuffix = `생존${survival}`;

    const next: OverlayItem = {
      ...o,
      label: `${base}·${labelSuffix}`,
      obMitigated: fullMit,
      zonePartialMitigation: partialMit && !fullMit,
      color: adjustRgbaAlpha(o.color, alphaMul),
    };
    return { item: next, rankScore };
  });

  scored.sort((a, b) => b.rankScore - a.rankScore);
  const top = scored.slice(0, MSB_OB_MAX_VISIBLE).map((x) => x.item);

  let pre3Out = pre3;
  if (pre3.length && top.length) {
    pre3Out = pre3.map((p) => {
      const pb = zoneBounds(p);
      if (!pb) return p;
      const overlaps = top.some((w) => {
        const wb = zoneBounds(w);
        if (!wb) return false;
        const priceOverlap = pb.hi >= wb.lo && pb.lo <= wb.hi;
        const pt1 = Number(p.time1 ?? 0);
        const pt2 = Number(p.time2 ?? pt1);
        const wt1 = Number(w.time1 ?? 0);
        const wt2 = Number(w.time2 ?? wt1);
        const timeOverlap = pt2 >= wt1 && pt1 <= wt2;
        return priceOverlap && timeOverlap;
      });
      if (!overlaps) return p;
      return {
        ...p,
        label: String(p.label || '').includes('합치')
          ? p.label
          : `${p.label || 'Pre3'}·OB합치`,
        color: adjustRgbaAlpha(p.color, 1.12),
      };
    });
  }

  return [...other, ...top, ...pre3Out];
}
