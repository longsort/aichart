/**
 * 마감·안착 — 플랜·존 라인 돌파·안착·거래량 공통 판정 (캔들 색·엔진·툴팁 공유).
 */
import type { Candle, OverlayItem } from '@/types';
import type { ClosingEnvelopeVerdictKo } from '@/lib/institutionalSuperBand';
import type { InstitutionalSuperTrendCore } from '@/lib/institutionalSuperBand';
import { normalizeChartTimeframe } from '@/lib/constants';

export type SettleProbeDir = 'above' | 'below';

export type SettleLevelProbe = {
  key: string;
  levelKo: string;
  level: number;
  dir: SettleProbeDir;
  weight: number;
};

export function priceOfOverlay(pack: OverlayItem[], id: string): number | null {
  const o = pack.find((x) => x.id === id);
  const p = o?.price1 ?? o?.price2;
  return typeof p === 'number' && Number.isFinite(p) ? p : null;
}

export function zoneBoundsOverlay(
  pack: OverlayItem[],
  id: string
): { top: number; bot: number } | null {
  const z = pack.find((x) => x.id === id);
  if (!z) return null;
  const p1 = Number(z.price1);
  const p2 = Number(z.price2);
  if (!Number.isFinite(p1) || !Number.isFinite(p2)) return null;
  return { top: Math.max(p1, p2), bot: Math.min(p1, p2) };
}

export function epsForLevel(level: number): number {
  return Math.max(Math.abs(level) * 0.00035, 1e-8);
}

export function volSma(candles: Candle[], endExclusive: number, len = 20): number {
  const to = Math.min(endExclusive, candles.length) - 1;
  const from = Math.max(0, to - len + 1);
  let s = 0;
  let c = 0;
  for (let i = from; i <= to; i++) {
    s += Number(candles[i]?.volume) || 0;
    c++;
  }
  return c > 0 ? s / c : 0;
}

/** 인포그래픽 BOS 돌파 — 20봉 평균 대비 1.5~2× 권장 */
export const SETTLE_BREAKOUT_VOL_RATIO = 1.5;

export function settleHoldBarsForTf(timeframe?: string): number {
  const tf = normalizeChartTimeframe(String(timeframe || '1d'));
  if (tf === '4h') return 3;
  if (tf === '1d' || tf === '1w' || tf === '1M') return 2;
  if (tf === '1h') return 2;
  return 2;
}

export function breakoutVolumeOk(
  candles: Candle[],
  breakIdx: number,
  minRatio = SETTLE_BREAKOUT_VOL_RATIO
): boolean {
  if (breakIdx < 0 || breakIdx >= candles.length) return false;
  const v = Number(candles[breakIdx]?.volume) || 0;
  const ma = volSma(candles, breakIdx, 20);
  return ma > 0 && v >= ma * minRatio;
}

export function findBreakIndex(candles: Candle[], level: number, dir: SettleProbeDir): number {
  return findBreakIndexFrom(candles, level, dir, 1);
}

export function findLastBreakIndex(
  candles: Candle[],
  level: number,
  dir: SettleProbeDir,
  fromIdx = 1
): number {
  const eps = epsForLevel(level);
  let last = -1;
  for (let i = Math.max(1, fromIdx); i < candles.length; i++) {
    const prev = candles[i - 1]!;
    const cur = candles[i]!;
    const wasBelow = Number(prev.close) < level - eps;
    const wasAbove = Number(prev.close) > level + eps;
    const nowAbove = Number(cur.close) >= level - eps;
    const nowBelow = Number(cur.close) <= level + eps;
    if (dir === 'above' && wasBelow && nowAbove) last = i;
    if (dir === 'below' && wasAbove && nowBelow) last = i;
  }
  return last;
}

function findBreakIndexFrom(
  candles: Candle[],
  level: number,
  dir: SettleProbeDir,
  fromIdx: number
): number {
  const eps = epsForLevel(level);
  for (let i = Math.max(1, fromIdx); i < candles.length; i++) {
    const prev = candles[i - 1]!;
    const cur = candles[i]!;
    const wasBelow = Number(prev.close) < level - eps;
    const wasAbove = Number(prev.close) > level + eps;
    const nowAbove = Number(cur.close) >= level - eps;
    const nowBelow = Number(cur.close) <= level + eps;
    if (dir === 'above' && wasBelow && nowAbove) return i;
    if (dir === 'below' && wasAbove && nowBelow) return i;
  }
  return -1;
}

/** 꼬리만 돌파·몸통은 레벨 아래(위) 마감 — 가짜 돌파 */
export function isFakeBreakoutCandle(c: Candle, level: number, dir: SettleProbeDir): boolean {
  const eps = epsForLevel(level);
  const cl = Number(c.close);
  if (!Number.isFinite(cl)) return false;
  if (dir === 'above') {
    return Number(c.high) >= level - eps && cl < level - eps;
  }
  return Number(c.low) <= level + eps && cl > level + eps;
}

/** 돌파 봉 고저 돌파 = BOS 확인 (③) */
export function findStructureConfirmIndex(
  candles: Candle[],
  breakIdx: number,
  dir: SettleProbeDir
): number {
  const br = candles[breakIdx];
  if (!br) return -1;
  const pivot = dir === 'above' ? Number(br.high) : Number(br.low);
  if (!Number.isFinite(pivot)) return -1;
  for (let i = breakIdx + 1; i < candles.length; i++) {
    const c = candles[i]!;
    if (dir === 'above' && Number(c.high) > pivot) return i;
    if (dir === 'below' && Number(c.low) < pivot) return i;
  }
  return -1;
}

export function holdClosesBeyond(
  candles: Candle[],
  fromIdx: number,
  level: number,
  dir: SettleProbeDir,
  need = 2
): boolean {
  let n = 0;
  const eps = epsForLevel(level);
  for (let i = Math.max(0, fromIdx); i < candles.length; i++) {
    const cl = Number(candles[i]?.close);
    if (!Number.isFinite(cl)) continue;
    const ok = dir === 'above' ? cl >= level - eps : cl <= level + eps;
    if (ok) n++;
    else if (i >= candles.length - 2) break;
    else n = 0;
  }
  return n >= need;
}

export function retestAfterBreak(
  candles: Candle[],
  breakIdx: number,
  level: number,
  dir: SettleProbeDir
): { touched: boolean; violated: boolean; volOk: boolean; retestIdx: number } {
  const eps = epsForLevel(level);
  let touched = false;
  let violated = false;
  let retestIdx = -1;
  for (let i = breakIdx + 1; i < candles.length; i++) {
    const c = candles[i]!;
    const touch = dir === 'above' ? Number(c.low) <= level + eps : Number(c.high) >= level - eps;
    if (!touch) continue;
    touched = true;
    retestIdx = i;
    violated = dir === 'above' ? Number(c.low) < level - eps : Number(c.high) > level + eps;
    break;
  }
  let volOk = false;
  if (retestIdx >= 0) {
    const ma = volSma(candles, retestIdx, 20);
    const v = Number(candles[retestIdx]?.volume) || 0;
    volOk = ma > 0 && v >= ma;
  }
  return { touched, violated, volOk, retestIdx };
}

function pushProbe(
  probes: SettleLevelProbe[],
  key: string,
  levelKo: string,
  level: number | null,
  dir: SettleProbeDir,
  weight: number
) {
  if (level == null || !Number.isFinite(level)) return;
  probes.push({ key, levelKo, level, dir, weight });
}

export function buildSettleLevelProbes(pack: OverlayItem[]): SettleLevelProbe[] {
  const probes: SettleLevelProbe[] = [];

  pushProbe(probes, 'strike-long-e', 'Strike 롱 E', priceOfOverlay(pack, 'month-desk-strike-long-entry'), 'above', 100);
  pushProbe(probes, 'strike-long-sl', 'Strike 롱 SL', priceOfOverlay(pack, 'month-desk-strike-long-sl'), 'below', 98);
  pushProbe(probes, 'strike-short-e', 'Strike 숏 E', priceOfOverlay(pack, 'month-desk-strike-short-entry'), 'below', 100);
  pushProbe(probes, 'strike-short-sl', 'Strike 숏 SL', priceOfOverlay(pack, 'month-desk-strike-short-sl'), 'above', 98);
  pushProbe(probes, 'strike-long-tp1', 'Strike 롱 TP1', priceOfOverlay(pack, 'month-desk-strike-long-tp1'), 'above', 72);
  pushProbe(probes, 'strike-short-tp1', 'Strike 숏 TP1', priceOfOverlay(pack, 'month-desk-strike-short-tp1'), 'below', 72);

  const entry = priceOfOverlay(pack, 'month-desk-plan-entry');
  const sl = priceOfOverlay(pack, 'month-desk-plan-sl');
  const tp1 = priceOfOverlay(pack, 'month-desk-plan-tp1');
  const tp2 = priceOfOverlay(pack, 'month-desk-plan-tp2');
  const tp3 = priceOfOverlay(pack, 'month-desk-plan-tp3');
  const inv = priceOfOverlay(pack, 'month-desk-anchor-invalidation');
  const reward = zoneBoundsOverlay(pack, 'month-desk-plan-reward-zone');
  const risk = zoneBoundsOverlay(pack, 'month-desk-plan-risk-zone');

  if (entry != null) {
    probes.push({ key: 'entry-up', levelKo: '진입', level: entry, dir: 'above', weight: 92 });
    probes.push({ key: 'entry-dn', levelKo: '진입', level: entry, dir: 'below', weight: 88 });
  }
  if (reward != null) {
    probes.push({ key: 'reward-top', levelKo: '수익존', level: reward.top, dir: 'above', weight: 78 });
    probes.push({ key: 'reward-bot', levelKo: '수익존', level: reward.bot, dir: 'below', weight: 70 });
  }
  if (risk != null) {
    probes.push({ key: 'risk-top', levelKo: '위험존', level: risk.top, dir: 'above', weight: 65 });
    probes.push({ key: 'risk-bot', levelKo: '위험존', level: risk.bot, dir: 'below', weight: 82 });
  }
  if (sl != null) {
    probes.push({ key: 'sl-dn', levelKo: '손절', level: sl, dir: 'below', weight: 95 });
    probes.push({ key: 'sl-up', levelKo: '손절', level: sl, dir: 'above', weight: 72 });
  }
  if (tp1 != null) {
    probes.push({ key: 'tp1-up', levelKo: 'TP1', level: tp1, dir: 'above', weight: 74 });
  }
  if (tp2 != null) {
    probes.push({ key: 'tp2-up', levelKo: 'TP2', level: tp2, dir: 'above', weight: 72 });
  }
  if (tp3 != null) {
    probes.push({ key: 'tp3-up', levelKo: 'TP3', level: tp3, dir: 'above', weight: 70 });
  }
  if (inv != null) {
    probes.push({ key: 'inv-dn', levelKo: '무효화', level: inv, dir: 'below', weight: 90 });
    probes.push({ key: 'inv-up', levelKo: '무효화', level: inv, dir: 'above', weight: 90 });
  }
  return probes;
}

export type SettleBreakEvalOpts = {
  holdBars?: number;
  minVolRatio?: number;
  useLastBreak?: boolean;
  timeframe?: string;
};

export type SettleBreakSnapshot = {
  probe: SettleLevelProbe;
  breakIdx: number;
  breakVolOk: boolean;
  hold2: boolean;
  holdN: boolean;
  holdNeed: number;
  confirmIdx: number;
  fakeBreak: boolean;
  retest: ReturnType<typeof retestAfterBreak>;
  stillAbove: boolean;
};

/** 확정 봉 인덱스 — 마감존 안착/실패/불안 (`computeClosingEnvelopeVerdictMarkers`와 동일) */
export function closingEnvelopeVerdictAtBar(
  candles: Candle[],
  barIndex: number,
  core: InstitutionalSuperTrendCore
): ClosingEnvelopeVerdictKo | null {
  const { trend, finalUpper, finalLower } = core;
  const c = candles[barIndex];
  if (!c) return null;
  const cl = Number(c.close);
  const hi = Number(c.high);
  const lo = Number(c.low);
  const fu = finalUpper[barIndex];
  const fl = finalLower[barIndex];
  if (!Number.isFinite(cl) || !Number.isFinite(fu) || !Number.isFinite(fl)) return null;
  const bw = Math.max(fu - fl, 1e-12);
  const eps = Math.max(bw * 0.03, Math.abs(cl) * 1e-8);
  if (trend[barIndex] === 1) {
    if (cl < fl) return '실패';
    if (Number.isFinite(lo) && lo <= fl + eps) return '안착';
    return '불안';
  }
  if (cl > fu) return '실패';
  if (Number.isFinite(hi) && hi >= fu - eps) return '안착';
  return '불안';
}

/** 마지막 확정 봉 = candles[length-1] (진행 봉 제외된 시리즈) */
export function splitConfirmedClosedCandles(candles: Candle[]): {
  closed: Candle[];
  forming: Candle | null;
} {
  if (candles.length < 2) return { closed: [], forming: candles[0] ?? null };
  return { closed: candles.slice(0, -1), forming: candles[candles.length - 1] ?? null };
}

export function evaluateSettleBreak(
  candles: Candle[],
  probe: SettleLevelProbe,
  opts?: SettleBreakEvalOpts
): SettleBreakSnapshot | null {
  const holdNeed = opts?.holdBars ?? settleHoldBarsForTf(opts?.timeframe);
  const minVol = opts?.minVolRatio ?? SETTLE_BREAKOUT_VOL_RATIO;
  const bi = opts?.useLastBreak
    ? findLastBreakIndex(candles, probe.level, probe.dir)
    : findBreakIndex(candles, probe.level, probe.dir);
  if (bi < 0) return null;
  const last = candles[candles.length - 1]!;
  const eps = epsForLevel(probe.level);
  const cl = Number(last.close);
  const stillAbove = probe.dir === 'above' ? cl >= probe.level - eps : cl <= probe.level + eps;
  const br = candles[bi]!;
  const fakeBreak = isFakeBreakoutCandle(br, probe.level, probe.dir);
  return {
    probe,
    breakIdx: bi,
    breakVolOk: breakoutVolumeOk(candles, bi, minVol),
    hold2: holdClosesBeyond(candles, bi, probe.level, probe.dir, 2),
    holdN: holdClosesBeyond(candles, bi, probe.level, probe.dir, holdNeed),
    holdNeed,
    confirmIdx: findStructureConfirmIndex(candles, bi, probe.dir),
    fakeBreak,
    retest: retestAfterBreak(candles, bi, probe.level, probe.dir),
    stillAbove,
  };
}
