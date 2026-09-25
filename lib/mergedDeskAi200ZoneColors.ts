/**
 * AI200 zone 전용 색 — 폭락(노랑·초록·주황·와인)·Hot·청록·핑크저항과 분리.
 * 확정 승률·수익 보장 아님.
 */
export type Ai200ZoneRole = 'entry' | 'sl' | 'tp1' | 'tp2' | 'tp3';

export type Ai200ZoneColorPack = {
  fill: string;
  border: string;
  labelBg: string;
  labelFg: string;
  line: string;
  lifeClass: string;
};

/** 앱 기존 zone과 겹치지 않는 5색 세트 */
export const AI200_ZONE_COLORS: Record<Ai200ZoneRole, Ai200ZoneColorPack> = {
  entry: {
    fill: 'rgba(99,102,241,0.24)',
    border: 'rgba(99,102,241,0.92)',
    labelBg: 'rgba(49,46,129,0.94)',
    labelFg: '#E0E7FF',
    line: '#6366F1',
    lifeClass: 'merged-desk-ai200-entry',
  },
  sl: {
    fill: 'rgba(251,113,133,0.17)',
    border: 'rgba(251,113,133,0.88)',
    labelBg: 'rgba(136,19,55,0.9)',
    labelFg: '#FFE4E6',
    line: '#FB7185',
    lifeClass: 'merged-desk-ai200-sl',
  },
  tp1: {
    fill: 'rgba(139,92,246,0.2)',
    border: 'rgba(139,92,246,0.88)',
    labelBg: 'rgba(76,29,149,0.92)',
    labelFg: '#EDE9FE',
    line: '#8B5CF6',
    lifeClass: 'merged-desk-ai200-tp1',
  },
  tp2: {
    fill: 'rgba(217,70,239,0.16)',
    border: 'rgba(217,70,239,0.85)',
    labelBg: 'rgba(112,26,117,0.9)',
    labelFg: '#FAE8FF',
    line: '#D946EF',
    lifeClass: 'merged-desk-ai200-tp2',
  },
  tp3: {
    fill: 'rgba(129,140,248,0.15)',
    border: 'rgba(129,140,248,0.82)',
    labelBg: 'rgba(55,48,163,0.88)',
    labelFg: '#EEF2FF',
    line: '#818CF8',
    lifeClass: 'merged-desk-ai200-tp3',
  },
};

export function ai200ZoneHalf(anchor: number, ref: number, minPct = 0.00032): number {
  if (!(anchor > 0)) return 8;
  return Math.max(Math.abs(anchor - ref) * 0.2, anchor * minPct, 5);
}
