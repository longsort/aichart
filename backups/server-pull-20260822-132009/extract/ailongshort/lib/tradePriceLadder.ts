import type { MonthDeskCoreLevels } from '@/lib/monthDeskCoreLevels';

export type LadderMark = {
  key: string;
  label: string;
  price: number;
  pct: number;
  color: string;
  kind: 'invalid' | 'support' | 'entry' | 'close' | 'resistance' | 'tp';
};

export function buildTradePriceLadder(
  levels: MonthDeskCoreLevels,
  verdict: 'LONG' | 'SHORT' | 'WAIT'
): { marks: LadderMark[]; spanLabel: string } | null {
  const close = levels.close;
  if (close == null) return null;

  const pts: { price: number; kind: LadderMark['kind']; label: string; color: string }[] = [];
  if (levels.invalidation != null) pts.push({ price: levels.invalidation, kind: 'invalid', label: '무효', color: '#f87171' });
  if (levels.support != null) pts.push({ price: levels.support, kind: 'support', label: '지지', color: '#4ade80' });
  if (levels.entryLow != null) pts.push({ price: levels.entryLow, kind: 'entry', label: '타점↓', color: '#a78bfa' });
  if (levels.entryHigh != null) pts.push({ price: levels.entryHigh, kind: 'entry', label: '타점↑', color: '#a78bfa' });
  pts.push({ price: close, kind: 'close', label: '현재', color: verdict === 'LONG' ? '#4ade80' : verdict === 'SHORT' ? '#f87171' : '#f8fafc' });
  if (levels.resistance != null) pts.push({ price: levels.resistance, kind: 'resistance', label: '저항', color: '#fb7185' });
  levels.targets.slice(0, 2).forEach((p, i) => {
    pts.push({ price: p, kind: 'tp', label: `TP${i + 1}`, color: '#38bdf8' });
  });

  if (pts.length < 2) return null;
  const prices = pts.map((p) => p.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min;
  if (range <= 0) return null;

  const pad = range * 0.08;
  const lo = min - pad;
  const hi = max + pad;
  const span = hi - lo;

  const marks: LadderMark[] = pts.map((p, i) => ({
    key: `${p.kind}-${i}`,
    label: p.label,
    price: p.price,
    pct: Math.max(2, Math.min(98, ((p.price - lo) / span) * 100)),
    color: p.color,
    kind: p.kind,
  }));

  return { marks, spanLabel: `${min >= 1000 ? min.toFixed(0) : min.toFixed(2)} ↔ ${max >= 1000 ? max.toFixed(0) : max.toFixed(2)}` };
}
