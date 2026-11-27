import { prisma } from '@/lib/prisma';

/** 재고 경보 밴드 — 미입고(0) / 긴급(빨강) / 주의(노랑) / 정상(초록) */
export type StockAlertBand = 'empty' | 'critical' | 'warn' | 'ok';

export const DEFAULT_CRITICAL_BELOW = 20;
export const DEFAULT_WARN_BELOW = 500;

/** 보유/목표 비율 기준 — ≤20% 빨강 · ≤40% 노랑 · 그 외(~100%) 초록 */
export const PCT_CRITICAL_AT_OR_BELOW = 20;
export const PCT_WARN_AT_OR_BELOW = 40;

export type ThresholdBundle = {
  global: {
    criticalBelowSku: number;
    warnBelowSku: number;
    criticalBelowSize: number;
    warnBelowSize: number;
    criticalBelowPressure: number;
    warnBelowPressure: number;
  };
  sizeOverrides: Record<string, { criticalBelow: number | null; warnBelow: number | null }>;
  pressureOverrides: Record<string, { criticalBelow: number | null; warnBelow: number | null }>;
};

export type ResolvedSkuThreshold = {
  criticalBelow: number;
  warnBelow: number;
  /** 색 계산용 SKU 목표(최대) 재고 */
  targetMax: number;
};

/** qty 가 어느 밴드인지 (critical < warn 가정) — 절대수량 레거시. 0=미입고(긴급 아님) */
export function classifyStockBand(
  qty: number,
  criticalBelow: number,
  warnBelow: number,
): StockAlertBand {
  if (qty <= 0) return 'empty';
  const c = Math.max(0, criticalBelow);
  const w = Math.max(c, warnBelow);
  if (qty < c) return 'critical';
  if (qty < w) return 'warn';
  return 'ok';
}

/**
 * 보유수량 / 목표(최대) 비율로 밴드 판정.
 * 0개=미입고(긴급 아님) · ≤20% → 긴급 · ≤40% → 주의 · 그 외 → 정상
 */
export function classifyStockBandByTargetPct(
  onHand: number,
  targetMax: number,
): StockAlertBand {
  if (onHand <= 0) return 'empty';
  const max = Math.max(0, Math.floor(targetMax));
  if (max <= 0) return 'ok';
  const pct = (Math.max(0, onHand) / max) * 100;
  if (pct <= PCT_CRITICAL_AT_OR_BELOW) return 'critical';
  if (pct <= PCT_WARN_AT_OR_BELOW) return 'warn';
  return 'ok';
}

/** 보유/목표 % (0~∞, 목표 없으면 null) */
export function stockFillPct(onHand: number, targetMax: number): number | null {
  const max = Math.max(0, Math.floor(targetMax));
  if (max <= 0) return null;
  return (Math.max(0, onHand) / max) * 100;
}

export function bandLabelKo(band: StockAlertBand): string {
  if (band === 'empty') return '미입고';
  if (band === 'critical') return '긴급';
  if (band === 'warn') return '주의';
  return '정상';
}

export function bandTextClass(band: StockAlertBand): string {
  if (band === 'empty') return 'font-semibold text-slate-400';
  if (band === 'critical') return 'font-semibold text-red-400';
  if (band === 'warn') return 'font-semibold text-amber-300';
  return 'font-semibold text-emerald-300';
}

/** 보유 옆 색 네모 */
export function bandSquareClass(band: StockAlertBand): string {
  if (band === 'empty') return 'bg-slate-500';
  if (band === 'critical') return 'bg-red-500';
  if (band === 'warn') return 'bg-amber-400';
  return 'bg-emerald-400';
}

export function bandChipClass(band: StockAlertBand, active: boolean): string {
  if (active) {
    if (band === 'empty') return 'border-slate-500 bg-slate-800 text-slate-100';
    if (band === 'critical') return 'border-red-600 bg-red-900/70 text-red-100';
    if (band === 'warn') return 'border-amber-600 bg-amber-900/60 text-amber-100';
    return 'border-emerald-600 bg-emerald-900/50 text-emerald-100';
  }
  if (band === 'empty') return 'border-slate-700 bg-slate-900/50 text-slate-300';
  if (band === 'critical') return 'border-red-900/70 bg-red-950/40 text-red-300';
  if (band === 'warn') return 'border-amber-900/70 bg-amber-950/30 text-amber-200';
  return 'border-emerald-900/70 bg-emerald-950/30 text-emerald-200';
}

/**
 * SKU 목표(최대) + 절대 경보 밴드 해석
 * targetMax 우선순위: Item.targetStock(>0) → Item.safetyStock(>0) → 압력/사이즈 덮어쓰기 warn → 전역 warnBelowSku
 * critical/warn 절대값은 레거시·표시용으로 유지 (색은 target % 기준)
 */
export function resolveSkuThreshold(
  bundle: ThresholdBundle,
  opts: { pressureClass?: string; size?: string; safetyStock?: number; targetStock?: number },
): ResolvedSkuThreshold {
  let criticalBelow = bundle.global.criticalBelowSku;
  let warnBelow = bundle.global.warnBelowSku;

  const pc = (opts.pressureClass || '').trim();
  if (pc && bundle.pressureOverrides[pc]) {
    const o = bundle.pressureOverrides[pc];
    if (o.criticalBelow != null) criticalBelow = o.criticalBelow;
    if (o.warnBelow != null) warnBelow = o.warnBelow;
  }

  const size = (opts.size || '').trim();
  if (size && bundle.sizeOverrides[size]) {
    const o = bundle.sizeOverrides[size];
    if (o.criticalBelow != null) criticalBelow = o.criticalBelow;
    if (o.warnBelow != null) warnBelow = o.warnBelow;
  }

  const safety = opts.safetyStock ?? 0;
  if (Number.isFinite(safety) && safety > 0) {
    warnBelow = safety;
  }

  if (warnBelow < criticalBelow) warnBelow = criticalBelow;

  const itemTarget = opts.targetStock ?? 0;
  let targetMax = warnBelow;
  if (Number.isFinite(itemTarget) && itemTarget > 0) {
    targetMax = Math.floor(itemTarget);
  } else if (Number.isFinite(safety) && safety > 0) {
    targetMax = Math.floor(safety);
  }

  if (targetMax < 1) targetMax = Math.max(1, warnBelow || DEFAULT_WARN_BELOW);

  return { criticalBelow, warnBelow, targetMax };
}

/** DB에서 경보 설정 로드 (없으면 기본값 upsert) */
export async function loadThresholdBundle(): Promise<ThresholdBundle> {
  const global = await prisma.inventoryThresholdSettings.upsert({
    where: { id: 'default' },
    create: {
      id: 'default',
      criticalBelowSku: DEFAULT_CRITICAL_BELOW,
      warnBelowSku: DEFAULT_WARN_BELOW,
      criticalBelowSize: DEFAULT_CRITICAL_BELOW,
      warnBelowSize: DEFAULT_WARN_BELOW,
      criticalBelowPressure: DEFAULT_CRITICAL_BELOW,
      warnBelowPressure: DEFAULT_WARN_BELOW,
    },
    update: {},
  });

  const [sizeRows, pressureRows] = await Promise.all([
    prisma.sizeThresholdOverride.findMany(),
    prisma.pressureThresholdOverride.findMany(),
  ]);

  const sizeOverrides: ThresholdBundle['sizeOverrides'] = {};
  for (const r of sizeRows) {
    sizeOverrides[r.nominalSize] = {
      criticalBelow: r.criticalBelow,
      warnBelow: r.warnBelow,
    };
  }

  const pressureOverrides: ThresholdBundle['pressureOverrides'] = {};
  for (const r of pressureRows) {
    pressureOverrides[r.pressureClass] = {
      criticalBelow: r.criticalBelow,
      warnBelow: r.warnBelow,
    };
  }

  return {
    global: {
      criticalBelowSku: global.criticalBelowSku,
      warnBelowSku: global.warnBelowSku,
      criticalBelowSize: global.criticalBelowSize,
      warnBelowSize: global.warnBelowSize,
      criticalBelowPressure: global.criticalBelowPressure,
      warnBelowPressure: global.warnBelowPressure,
    },
    sizeOverrides,
    pressureOverrides,
  };
}

export function parseNonNegInt(raw: unknown, fallback: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.floor(n));
}

export function parseOptionalNonNegInt(raw: unknown): number | null {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.floor(n));
}
