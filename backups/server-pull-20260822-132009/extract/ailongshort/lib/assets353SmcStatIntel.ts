/**
 * SMC 353 — S/R·OB·구조 확정 통계 (로그·과거 반응 기반, 확정 수익 아님).
 */
import type { Candle } from '@/types';
import { resolveStructureMarkPhase } from '@/lib/smcDeskOverlay';
import type { SmcObHit } from '@/lib/smcStructureOrderBlocks';

function atrLocal(candles: Candle[], end: number, period = 14): number {
  const start = Math.max(1, end - period);
  let sum = 0;
  let n = 0;
  for (let i = start; i <= end; i++) {
    const c = candles[i]!;
    const p = candles[i - 1]!;
    sum += Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close));
    n++;
  }
  return n > 0 ? sum / n : 0;
}

/** 지지/저항 — 과거 터치 후 반등·거부 비율 */
export function computeSrHoldPct(
  candles: Candle[],
  level: number,
  side: 'support' | 'resistance'
): number {
  const n = candles.length;
  if (n < 20 || !(level > 0)) return 52;
  const atr = atrLocal(candles, n - 1) || level * 0.004;
  const tol = Math.max(atr * 0.38, level * 1.2e-5);
  let touches = 0;
  let holds = 0;
  for (let i = 2; i < n - 2; i++) {
    const c = candles[i]!;
    if (side === 'support') {
      if (c.low > level + tol || c.low < level - tol * 1.6) continue;
      touches++;
      const fwd = candles.slice(i + 1, Math.min(n, i + 6));
      if (fwd.some((f) => f.close >= level - tol * 0.5) && !fwd.some((f) => f.close < level - tol * 1.2)) {
        holds++;
      }
    } else {
      if (c.high < level - tol || c.high > level + tol * 1.6) continue;
      touches++;
      const fwd = candles.slice(i + 1, Math.min(n, i + 6));
      if (fwd.some((f) => f.close <= level + tol * 0.5) && !fwd.some((f) => f.close > level + tol * 1.2)) {
        holds++;
      }
    }
  }
  if (touches < 2) return side === 'support' ? 58 : 56;
  const raw = Math.round((holds / touches) * 100);
  return Math.max(38, Math.min(92, raw));
}

/** OB — BOS 연계·미소진·반응·거래량 가중 (종가 이탈 시 무효) */
export function computeObStatIntel(
  candles: Candle[],
  ob: SmcObHit
): { pct: number; confirmed: boolean; caption: string; broken: boolean } {
  const n = candles.length;
  let score = 48;
  const c = candles[ob.index];
  if (!c) return { pct: 52, confirmed: false, caption: 'OB', broken: false };

  const atr = atrLocal(candles, ob.bosIndex) || c.close * 0.004;
  if (ob.bosIndex > ob.index && ob.bosIndex - ob.index <= 8) score += 18;
  if (ob.bosIndex >= ob.index) score += 6;

  let mitigated = false;
  for (let j = ob.index + 1; j < n; j++) {
    if (candles[j]!.low <= ob.high && candles[j]!.high >= ob.low) {
      mitigated = true;
      break;
    }
  }
  if (!mitigated) score += 14;

  let broken = false;
  for (let j = ob.index + 1; j < n; j++) {
    const x = candles[j]!;
    if (ob.bias === 'bullish' && x.close < ob.low) {
      broken = true;
      break;
    }
    if (ob.bias === 'bearish' && x.close > ob.high) {
      broken = true;
      break;
    }
  }
  if (broken) {
    return {
      pct: Math.max(20, Math.min(45, Math.round(score * 0.45))),
      confirmed: false,
      caption: 'OB무효',
      broken: true,
    };
  }

  const after = candles.slice(ob.bosIndex + 1, Math.min(n, ob.bosIndex + 12));
  if (ob.bias === 'bullish') {
    if (after.some((x) => x.close > ob.high + atr * 0.25)) score += 10;
  } else if (after.some((x) => x.close < ob.low - atr * 0.25)) {
    score += 10;
  }

  const volAvg =
    candles.slice(Math.max(0, ob.index - 12), ob.index + 1).reduce((s, x) => s + Math.max(x.volume || 0, 1), 0) /
    Math.max(1, Math.min(13, ob.index + 1));
  if ((c.volume || 0) > volAvg * 1.2) score += 8;

  const pct = Math.max(42, Math.min(94, Math.round(score)));
  const confirmed = pct >= 68 && !mitigated && ob.bosIndex > ob.index;
  const caption = confirmed ? `OB${pct}` : `OB${pct}`;
  return { pct, confirmed, caption, broken: false };
}

/** BOS/ChoCH — 종가 유지 단계 + 반응 폭 */
export function computeStructureConfirmPct(
  candles: Candle[],
  mark: { index: number; price: number; bias: 'bullish' | 'bearish'; tag: string }
): { pct: number; phase: ReturnType<typeof resolveStructureMarkPhase>; confirmed: boolean } {
  const n = candles.length;
  const phase = resolveStructureMarkPhase(mark, candles, n);
  let pct = phase === 'confirmed' ? 78 : phase === 'settling' ? 64 : phase === 'failed' ? 41 : 55;
  const atr = atrLocal(candles, mark.index) || mark.price * 0.004;
  const barsHeld = Math.max(0, n - mark.index - 1);
  pct += Math.min(12, barsHeld * 2);
  if (mark.bias === 'bullish') {
    const hi = Math.max(...candles.slice(mark.index, n).map((c) => c.high));
    if (hi - mark.price >= atr * 0.8) pct += 6;
  } else {
    const lo = Math.min(...candles.slice(mark.index, n).map((c) => c.low));
    if (mark.price - lo >= atr * 0.8) pct += 6;
  }
  pct = Math.max(35, Math.min(93, Math.round(pct)));
  return { pct, phase, confirmed: phase === 'confirmed' && pct >= 68 };
}

export function structureConfirmLabel(
  tag: 'BOS' | 'CHOCH',
  bias: 'bullish' | 'bearish',
  pct: number,
  confirmed: boolean
): string {
  const arrow = bias === 'bullish' ? '▲' : '▼';
  const conf = confirmed ? ' CONF' : '';
  return `${tag}${conf} ${arrow} ${pct}%`;
}
