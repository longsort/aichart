import { prisma } from '@/lib/prisma';

/** 재고 경보 밴드 — 긴급(빨강) / 주의(노랑) / 정상(초록) */
export type StockAlertBand = 'critical' | 'warn' | 'ok';

export const DEFAULT_CRITICAL_BELOW = 20;
export const DEFAULT_WARN_BELOW = 500;

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
};

/** qty 가 어느 밴드인지 (critical < warn 가정) */
export function classifyStockBand(
  qty: number,
  criticalBelow: number,
  warnBelow: number,
): StockAlertBand {
  const c = Math.max(0, criticalBelow);
  const w = Math.max(c, warnBelow);
  if (qty < c) return 'critical';
  if (qty < w) return 'warn';
  return 'ok';
}

export function bandLabelKo(band: StockAlertBand): string {
  if (band === 'critical') return '긴급';
  if (band === 'warn') return '주의';
  return '정상';
}

export function bandTextClass(band: StockAlertBand): string {
  if (band === 'critical') return 'font-semibold text-red-400';
  if (band === 'warn') return 'font-semibold text-amber-300';
  return 'font-semibold text-emerald-300';
}

export function bandChipClass(band: StockAlertBand, active: boolean): string {
  if (active) {
    if (band === 'critical') return 'border-red-600 bg-red-900/70 text-red-100';
    if (band === 'warn') return 'border-amber-600 bg-amber-900/60 text-amber-100';
    return 'border-emerald-600 bg-emerald-900/50 text-emerald-100';
  }
  if (band === 'critical') return 'border-red-900/70 bg-red-950/40 text-red-300';
  if (band === 'warn') return 'border-amber-900/70 bg-amber-950/30 text-amber-200';
  return 'border-emerald-900/70 bg-emerald-950/30 text-emerald-200';
}

/**
 * SKU 보유수량용 기준 해석
 * 우선순위: 전역 SKU → 압력 덮어쓰기 → 사이즈 덮어쓰기 → Item.safetyStock(>0이면 주의 상한)
 */
export function resolveSkuThreshold(
  bundle: ThresholdBundle,
  opts: { pressureClass?: string; size?: string; safetyStock?: number },
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
  return { criticalBelow, warnBelow };
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
