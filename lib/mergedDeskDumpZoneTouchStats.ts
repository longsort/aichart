/**
 * 폭락 zone — 차트 캔들 기준 터치 횟수 · 터치 후 반등/거부 조건부 비율.
 * 확정 승률·수익 보장 아님.
 */
import type { Candle } from '@/types';

export type DumpZoneTouchStats = {
  touchCount: number;
  /** 터치 후 유리 방향 반응 횟수 (floor=반등 · ceiling=거부하락) */
  reactionCount: number;
  /** 0~100 · 표본 부족 시 null */
  reactionPct: number | null;
  sampleOk: boolean;
  labelKo: string;
  tipKo: string;
};

function atrPad(candles: Candle[]): number {
  const n = candles.length;
  const mid = Number(candles[n - 1]?.close) || 1;
  if (n < 8) return mid * 0.002;
  let s = 0;
  let c = 0;
  for (let i = Math.max(1, n - 14); i < n; i++) {
    const a = candles[i]!;
    const b = candles[i - 1]!;
    const tr = Math.max(
      Number(a.high) - Number(a.low),
      Math.abs(Number(a.high) - Number(b.close)),
      Math.abs(Number(a.low) - Number(b.close))
    );
    if (Number.isFinite(tr)) {
      s += tr;
      c += 1;
    }
  }
  return Math.max(c > 0 ? s / c : mid * 0.006, mid * 0.0005);
}

function barTouchesBand(c: Candle, top: number, bot: number, pad: number): boolean {
  const hi = Number(c.high);
  const lo = Number(c.low);
  const cl = Number(c.close);
  if (!(hi > 0) || !(lo > 0)) return false;
  const bandHi = Math.max(top, bot) + pad;
  const bandLo = Math.min(top, bot) - pad;
  if (hi < bandLo || lo > bandHi) return false;
  /** wick 또는 종가가 밴드와 겹침 */
  return hi >= bandLo && lo <= bandHi && (cl >= bandLo * 0.998 || hi >= bandLo || lo <= bandHi);
}

/**
 * 최근 lookback 봉에서 zone 터치 횟수 + 터치 후 반응 비율.
 * floor: 터치 뒤 horizon봉 내 high가 mid 위로 → 반등 반응
 * ceiling: 터치 뒤 horizon봉 내 low가 mid 아래로 → 거부 반응
 */
export function computeDumpZoneTouchStats(params: {
  candles: Candle[];
  top: number;
  bot: number;
  mid?: number;
  bandRole?: 'floor' | 'ceiling';
  lookback?: number;
  horizon?: number;
}): DumpZoneTouchStats {
  const empty: DumpZoneTouchStats = {
    touchCount: 0,
    reactionCount: 0,
    reactionPct: null,
    sampleOk: false,
    labelKo: '터치0',
    tipKo: '터치 표본 없음 · 조건부 참고',
  };
  const candles = params.candles ?? [];
  const n = candles.length;
  const top = Number(params.top);
  const bot = Number(params.bot);
  if (n < 12 || !(top > 0) || !(bot > 0)) return empty;

  const mid =
    Number(params.mid) > 0 ? Number(params.mid) : (Math.max(top, bot) + Math.min(top, bot)) / 2;
  const atr = atrPad(candles);
  const pad = Math.max(atr * 0.12, mid * 0.00045);
  const lookback = Math.min(n - 4, Math.max(24, params.lookback ?? 120));
  const horizon = Math.max(2, Math.min(8, params.horizon ?? 5));
  const isCeiling = params.bandRole === 'ceiling';
  const from = Math.max(1, n - lookback);

  let touchCount = 0;
  let reactionCount = 0;
  let scored = 0;
  let lastTouch = -99;

  for (let i = from; i < n - 1; i++) {
    if (i - lastTouch < 2) continue; /** 연속봉 중복 터치 압축 */
    const c = candles[i]!;
    if (!barTouchesBand(c, top, bot, pad)) continue;
    touchCount += 1;
    lastTouch = i;

    const end = Math.min(n - 1, i + horizon);
    let reacted = false;
    for (let j = i + 1; j <= end; j++) {
      const bar = candles[j]!;
      if (isCeiling) {
        if (Number(bar.low) <= mid - atr * 0.25) {
          reacted = true;
          break;
        }
      } else if (Number(bar.high) >= mid + atr * 0.25) {
        reacted = true;
        break;
      }
    }
    /** 마지막 근처 터치는 horizon 미완 → 비율 분모에서 제외 */
    if (i + horizon < n) {
      scored += 1;
      if (reacted) reactionCount += 1;
    }
  }

  const reactionPct =
    scored >= 3 ? Math.round((reactionCount / scored) * 1000) / 10 : null;
  const sampleOk = scored >= 3;
  const reactKo = isCeiling ? '거부' : '반등';
  const labelKo =
    reactionPct != null
      ? `터치${touchCount}·${reactKo}${Math.round(reactionPct)}%`
      : `터치${touchCount}`;
  const tipKo =
    reactionPct != null
      ? `최근 ${lookback}봉 · 터치 ${touchCount}회 · 평가 ${scored}건 중 ${reactKo} ${reactionCount}건 (${reactionPct}%) · 확정 승률 아님`
      : `최근 ${lookback}봉 · 터치 ${touchCount}회 · 표본 부족(평가 ${scored}) · 조건부 참고`;

  return {
    touchCount,
    reactionCount,
    reactionPct,
    sampleOk,
    labelKo,
    tipKo,
  };
}
