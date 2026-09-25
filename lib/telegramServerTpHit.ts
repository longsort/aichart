/**
 * 서버 — TP1/2/3 터치 감지 (확정·타점 이후, 순차 1→2→3).
 */
import type { TelegramServerPhaseRow } from '@/lib/telegramServerPhaseState';

export type TelegramTpHitKind = 'tp1' | 'tp2' | 'tp3';

const TP_SEQ: TelegramTpHitKind[] = ['tp1', 'tp2', 'tp3'];

function tpPrice(
  kind: TelegramTpHitKind,
  levels: { tp1: number | null; tp2: number | null; tp3: number | null },
  prev: TelegramServerPhaseRow
): number | null {
  if (kind === 'tp1') return levels.tp1 ?? prev.tp1;
  if (kind === 'tp2') return levels.tp2 ?? prev.tp2;
  return levels.tp3 ?? prev.tp3;
}

export function detectTpHitTransition(
  prev: TelegramServerPhaseRow | null,
  price: number | null | undefined,
  direction: 'LONG' | 'SHORT' | 'WAIT',
  levels: { tp1: number | null; tp2: number | null; tp3: number | null }
): TelegramTpHitKind | null {
  if (!prev || !price || !Number.isFinite(price)) return null;
  if (direction !== 'LONG' && direction !== 'SHORT') return null;
  if (prev.phase === 'invalid' || prev.phase === 'wait') return null;
  if (prev.phase !== 'at_entry' && prev.phase !== 'confirmed' && prev.phase !== 'confirmed_full') {
    return null;
  }

  const last = prev.lastTpHit ?? null;
  const startIdx = last ? TP_SEQ.indexOf(last) + 1 : 0;
  for (let i = Math.max(0, startIdx); i < TP_SEQ.length; i++) {
    const kind = TP_SEQ[i]!;
    const p = tpPrice(kind, levels, prev);
    if (p == null || p <= 0) continue;
    const hit = direction === 'LONG' ? price >= p : price <= p;
    if (hit) return kind;
  }
  return null;
}

export function tpHitLabel(kind: TelegramTpHitKind): string {
  if (kind === 'tp1') return 'TP1 도달';
  if (kind === 'tp2') return 'TP2 도달';
  return 'TP3 도달';
}
