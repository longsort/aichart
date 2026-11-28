import { prisma } from '@/lib/prisma';
import type { Prisma } from '@prisma/client';
import {
  CATALOG_PRESSURE_CHIP_KEYS,
  NOMINAL_SIZES,
  compareNominalSize,
} from '@/lib/wms/codes';
import {
  catalogPressureChipLabel,
  itemMatchesCatalogPressure,
} from '@/lib/wms/yuil-catalog-filters';
import { matchesSkuQuickSearch } from '@/lib/wms/sku-quick-search';
import {
  classifyStockBand,
  loadThresholdBundle,
  resolveSkuThreshold,
  type StockAlertBand,
  type ThresholdBundle,
} from '@/lib/wms/stock-alerts';

export type SkuBoardFilters = {
  pressureClass?: string;
  size?: string;
  q?: string;
  /** 긴급·주의만 표시 */
  shortageOnly?: boolean;
  /** 긴급|주의|정상 한 밴드만 */
  band?: StockAlertBand;
  /**
   * true면 상세 SKU rows를 비움 (사이즈별 패널 등).
   * sizeTotals·bandCounts·pressureTotals·합계는 유지 — 1313행 DOM 동결 방지.
   */
  omitDetailRows?: boolean;
  /** 상세 표 페이지 (1-based). omitDetailRows면 무시 */
  page?: number;
  pageSize?: number;
  /**
   * true면 필터된 SKU 전부 반환 (입고대기 등).
   * 기본 페이지(80)만 주면 작은 사이즈만 잡혀 50A 검색이 빈 표가 됨.
   */
  unpaged?: boolean;
};

export const SKU_BOARD_DEFAULT_PAGE_SIZE = 80;

export type SkuBoardRow = {
  id: string;
  itemCode: string;
  itemName: string;
  materialType: string;
  productType: string;
  pressureClass: string;
  size: string;
  unit: string;
  safetyStock: number;
  /** SKU 개별 긴급 기준 (null=상속) */
  alertCriticalBelow: number | null;
  /** SKU 개별 주의 기준 (null=상속) */
  alertWarnBelow: number | null;
  onHand: number;
  locationName: string;
  band: StockAlertBand;
  criticalBelow: number;
  warnBelow: number;
};

export type BandCounts = {
  empty: number;
  critical: number;
  warn: number;
  ok: number;
};

/** 한 밴드 안에서 압력등급별 SKU 수 (발주·보충용) */
export type BandPressureCount = {
  pressureClass: string;
  skuCount: number;
  onHandTotal: number;
};

export type BandPressureBreakdown = Record<StockAlertBand, BandPressureCount[]>;

/** 전체 재고 — 사이즈별 보유 합계 (존재하는 사이즈) */
export type SizeOnHandTotal = {
  size: string;
  onHandTotal: number;
  skuCount: number;
};

function buildBandPressureBreakdown(rows: SkuBoardRow[]): BandPressureBreakdown {
  const acc: Record<StockAlertBand, Record<string, BandPressureCount>> = {
    empty: {},
    critical: {},
    warn: {},
    ok: {},
  };
  for (const r of rows) {
    const key = (r.pressureClass || '').trim() || '—';
    const bucket = acc[r.band];
    const cur = bucket[key] || { pressureClass: key, skuCount: 0, onHandTotal: 0 };
    cur.skuCount += 1;
    cur.onHandTotal += r.onHand;
    bucket[key] = cur;
  }
  const sortRows = (list: BandPressureCount[]) =>
    list.sort((a, b) => b.skuCount - a.skuCount || a.pressureClass.localeCompare(b.pressureClass, 'ko'));
  return {
    empty: sortRows(Object.values(acc.empty)),
    critical: sortRows(Object.values(acc.critical)),
    warn: sortRows(Object.values(acc.warn)),
    ok: sortRows(Object.values(acc.ok)),
  };
}

function annotateBand(row: Omit<SkuBoardRow, 'band' | 'criticalBelow' | 'warnBelow'>, bundle: ThresholdBundle): SkuBoardRow {
  const th = resolveSkuThreshold(bundle, {
    pressureClass: row.pressureClass,
    size: row.size,
    safetyStock: row.safetyStock,
    alertCriticalBelow: row.alertCriticalBelow,
    alertWarnBelow: row.alertWarnBelow,
  });
  const band = classifyStockBand(row.onHand, th.criticalBelow, th.warnBelow);
  return { ...row, band, criticalBelow: th.criticalBelow, warnBelow: th.warnBelow };
}

/** 압력·사이즈 칩 + 검색으로 SKU 목록 + 보유수량 + 경보 밴드 */
export async function listSkuBoard(filters: SkuBoardFilters = {}) {
  const where: Prisma.ItemWhereInput = { isActive: true };
  const pressure = (filters.pressureClass || '').trim();
  const size = (filters.size || '').trim();
  const q = (filters.q || '').trim();
  const shortageOnly = Boolean(filters.shortageOnly);
  const bandFilter = filters.band;

  if (size && size !== 'ALL') where.size = size;
  // q는 Prisma contains(사이즈 부분일치→150A⊃50a) 대신 메모리 토큰 매칭

  const [items, bundle, allActiveItems] = await Promise.all([
    prisma.item.findMany({
      where,
      include: {
        location: { select: { name: true, zone: true } },
        lots: { select: { quantity: true } },
      },
      orderBy: [{ pressureClass: 'asc' }, { itemCode: 'asc' }],
    }),
    loadThresholdBundle(),
    // 압력 칩 합계용 — 필터와 무관하게 활성 전체
    prisma.item.findMany({
      where: { isActive: true },
      select: {
        pressureClass: true,
        productType: true,
        standard: true,
        itemName: true,
        itemCode: true,
        size: true,
        lots: { select: { quantity: true } },
      },
    }),
  ]);

  const matched = items.filter((it) => {
    if (
      !itemMatchesCatalogPressure(
        {
          pressureClass: it.pressureClass,
          productType: it.productType,
          standard: it.standard,
          itemName: it.itemName,
          itemCode: it.itemCode,
        },
        pressure,
      )
    ) {
      return false;
    }
    if (!q) return true;
    return matchesSkuQuickSearch(
      {
        pressureClass: it.pressureClass,
        size: it.size,
        itemCode: it.itemCode,
        itemName: it.itemName,
        extra: `${it.standard || ''} ${it.productType || ''} ${catalogPressureChipLabel(it.pressureClass)}`,
      },
      q,
    );
  });

  const allBanded: SkuBoardRow[] = matched
    .map((it) =>
      annotateBand(
        {
          id: it.id,
          itemCode: it.itemCode,
          itemName: it.itemName,
          materialType: it.materialType,
          productType: it.productType,
          pressureClass: it.pressureClass,
          size: it.size,
          unit: it.unit,
          safetyStock: it.safetyStock,
          alertCriticalBelow: it.alertCriticalBelow ?? null,
          alertWarnBelow: it.alertWarnBelow ?? null,
          onHand: it.lots.reduce((s, l) => s + l.quantity, 0),
          locationName: it.location
            ? `${it.location.zone ? `${it.location.zone}/` : ''}${it.location.name}`
            : '—',
        },
        bundle,
      ),
    )
    .sort((a, b) => {
      const bySize = compareNominalSize(a.size, b.size);
      if (bySize !== 0) return bySize;
      const byPc = a.pressureClass.localeCompare(b.pressureClass, 'ko');
      if (byPc !== 0) return byPc;
      return a.itemCode.localeCompare(b.itemCode, 'ko');
    });

  const bandCounts: BandCounts = { empty: 0, critical: 0, warn: 0, ok: 0 };
  for (const r of allBanded) {
    bandCounts[r.band] += 1;
  }

  const bandPressureBreakdown = buildBandPressureBreakdown(allBanded);

  let filtered = allBanded;
  if (bandFilter === 'empty' || bandFilter === 'critical' || bandFilter === 'warn' || bandFilter === 'ok') {
    filtered = allBanded.filter((r) => r.band === bandFilter);
  } else if (shortageOnly) {
    filtered = allBanded.filter((r) => r.band === 'critical' || r.band === 'warn');
  }

  const filteredTotal = filtered.reduce((s, r) => s + r.onHand, 0);
  const skuCount = filtered.length;
  const unpaged = Boolean(filters.unpaged);
  const pageSize = unpaged
    ? Math.max(skuCount, 1)
    : Math.min(200, Math.max(20, Math.floor(filters.pageSize || SKU_BOARD_DEFAULT_PAGE_SIZE)));
  const totalPages = unpaged ? 1 : Math.max(1, Math.ceil(skuCount / pageSize));
  const page = unpaged ? 1 : Math.min(totalPages, Math.max(1, Math.floor(filters.page || 1)));
  /** 밴드 요약 표용 미리보기 (페이지와 무관, 상한) */
  const previewRows = filters.omitDetailRows ? [] : filtered.slice(0, 60);
  const rows = filters.omitDetailRows
    ? []
    : unpaged
      ? filtered
      : filtered.slice((page - 1) * pageSize, page * pageSize);

  const overallTotal = allActiveItems.reduce(
    (s, it) => s + it.lots.reduce((a, l) => a + l.quantity, 0),
    0,
  );

  // 전체 재고 사이즈별 합계 (SKU가 있는 사이즈 · qty 0 포함)
  const sizeAcc: Record<string, SizeOnHandTotal> = {};
  for (const it of allActiveItems) {
    const sizeKey = (it.size || '').trim() || '—';
    const qty = it.lots.reduce((s, l) => s + l.quantity, 0);
    const cur = sizeAcc[sizeKey] || { size: sizeKey, onHandTotal: 0, skuCount: 0 };
    cur.skuCount += 1;
    cur.onHandTotal += qty;
    sizeAcc[sizeKey] = cur;
  }
  const sizeTotals: SizeOnHandTotal[] = Object.values(sizeAcc).sort((a, b) => {
    if (a.size === '—' && b.size !== '—') return 1;
    if (b.size === '—' && a.size !== '—') return -1;
    const bySize = compareNominalSize(a.size, b.size);
    if (bySize !== 0) return bySize;
    return b.onHandTotal - a.onHandTotal;
  });

  // 압력 칩별 보유 합계 (카탈로그 매칭 + DB-only 키)
  const pressureTotals: Record<string, number> = {};
  for (const key of CATALOG_PRESSURE_CHIP_KEYS) {
    pressureTotals[key] = 0;
  }
  const catalogKeySet = new Set(CATALOG_PRESSURE_CHIP_KEYS);
  for (const it of allActiveItems) {
    const qty = it.lots.reduce((s, l) => s + l.quantity, 0);
    if (qty <= 0) continue;
    const identity = {
      pressureClass: it.pressureClass,
      productType: it.productType,
      standard: it.standard,
      itemName: it.itemName,
      itemCode: it.itemCode,
    };
    for (const key of CATALOG_PRESSURE_CHIP_KEYS) {
      if (itemMatchesCatalogPressure(identity, key)) {
        pressureTotals[key] += qty;
      }
    }
    const pc = (it.pressureClass || '').trim();
    if (pc && !catalogKeySet.has(pc)) {
      pressureTotals[pc] = (pressureTotals[pc] || 0) + qty;
    }
  }

  return {
    rows,
    previewRows,
    filteredTotal,
    overallTotal,
    skuCount,
    page,
    pageSize,
    totalPages,
    bandCounts,
    bandPressureBreakdown,
    pressureTotals,
    sizeTotals,
    thresholds: bundle.global,
  };
}

/** 칩에 쓸 압력·사이즈 옵션 (카탈로그 전체 + DB에만 있는 값) */
export async function getSkuFilterOptions() {
  const items = await prisma.item.findMany({
    where: { isActive: true },
    select: { pressureClass: true, size: true },
  });

  const pressureSeen = new Set<string>(CATALOG_PRESSURE_CHIP_KEYS);
  const pressures: string[] = [...CATALOG_PRESSURE_CHIP_KEYS];
  for (const it of items) {
    const pc = (it.pressureClass || '').trim();
    if (pc && !pressureSeen.has(pc)) {
      pressureSeen.add(pc);
      pressures.push(pc);
    }
  }

  const sizes = new Set<string>(NOMINAL_SIZES);
  for (const it of items) {
    if (it.size) sizes.add(it.size);
  }

  return {
    pressures,
    pressureLabels: Object.fromEntries(pressures.map((k) => [k, catalogPressureChipLabel(k)])),
    sizes: [...sizes].sort(compareNominalSize),
  };
}
