/**
 * 점수 분리 — 평균 합산으로 진입하지 않음.
 */
import type { Eagle1MainPlan } from '@/lib/eagle1/signalEngine';
import type { StructureSnapshot } from '@/lib/eagle1/structureEngine';
import type { TapScorePack } from './types';

function clamp(n: number, lo = 0, hi = 100): number {
  if (!Number.isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, Math.round(n)));
}

export function buildTapScorePack(params: {
  plan: Eagle1MainPlan | null;
  structure: StructureSnapshot | null;
  locationScore?: number;
  flowScore?: number;
  liquidityScore?: number;
  eventScore?: number;
  historicalScore?: number;
  failureRisk?: number;
  evScore?: number;
  setupBoost?: number;
}): TapScorePack {
  const plan = params.plan;
  const longS = plan?.longScore ?? 0;
  const shortS = plan?.shortScore ?? 0;
  const direction = clamp(Math.max(longS, shortS));
  const setupBase =
    plan?.entryQuality === 'good' ? 78 : plan?.entryQuality === 'ok' ? 58 : 35;
  const setup = clamp(setupBase + (params.setupBoost || 0));
  /** WATCH=55(게이트 50 통과) · 전투구간·흐름·이벤트 합성으로 IDLE도 타점 가능 */
  let entry =
    plan?.status === 'CONFIRMED_LONG' || plan?.status === 'CONFIRMED_SHORT'
      ? clamp(72 + (plan.agreementScore || 0) * 0.15)
      : plan?.status === 'LONG_WATCH' || plan?.status === 'SHORT_WATCH'
        ? 55
        : 28;
  const loc = params.locationScore ?? 45;
  const flow = params.flowScore ?? 50;
  const evn = params.eventScore ?? 30;
  const composite = clamp(loc * 0.35 + flow * 0.25 + evn * 0.25 + setup * 0.15);
  if (composite >= 56) entry = clamp(Math.max(entry, composite));
  const regimeMap: Record<string, number> = {
    STRONG_BULL: 82,
    BULL: 70,
    RANGE: 55,
    BEAR: 70,
    STRONG_BEAR: 82,
    ACCUMULATION: 62,
    DISTRIBUTION: 62,
    VOLATILITY_EXPANSION: 40,
    UNKNOWN: 35,
  };
  const regime = clamp(
    regimeMap[String(params.structure?.regime || plan?.regime || 'UNKNOWN')] ?? 40
  );
  const macro = clamp(
    (params.structure?.state === 'CONFIRMED' ? 72 : 50) +
      (direction > 70 ? 8 : 0)
  );

  return {
    macro,
    regime,
    direction,
    location: clamp(params.locationScore ?? 45),
    setup,
    entry: clamp(params.locationScore != null && params.locationScore < 40 ? Math.min(entry, 42) : entry),
    flow: clamp(params.flowScore ?? 50),
    liquidity: clamp(params.liquidityScore ?? 50),
    event: clamp(params.eventScore ?? 30),
    historical: clamp(params.historicalScore ?? 40),
    failureRisk: clamp(params.failureRisk ?? 45),
    ev: clamp(params.evScore ?? 40),
  };
}

/** ENTRY가 낮으면 방향·셋업이 높아도 확정 금지 */
/** 확정만 빡세게 — 잘못된 추격 차단 · 좋은 타점(구간·셋업)만 */
export function scoresAllowConfirm(s: TapScorePack): boolean {
  if (s.entry < 60) return false;
  if (s.location < 55) return false;
  if (s.failureRisk >= 70) return false;
  if (s.ev < 48 && s.event < 72) return false;
  if (s.direction < 58) return false;
  if (s.setup < 55) return false;
  if (s.flow < 45) return false;
  return true;
}

export function scoresAllowArmed(s: TapScorePack): boolean {
  if (s.direction < 58) return false;
  if (s.setup < 55) return false;
  if (s.location < 40) return false;
  if (s.failureRisk >= 80) return false;
  return true;
}
