/**
 * 재질 필터 — URL ?material=304|316 (없으면 전체).
 * DB MaterialType: SCS304 / SCS316 / SEMI_RAW
 */

export type MaterialFilter = 'ALL' | '304' | '316';

export function parseMaterialFilter(raw?: string | null): MaterialFilter {
  const v = String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/^SCS/, '');
  if (v === '304') return '304';
  if (v === '316') return '316';
  return 'ALL';
}

/** Prisma MaterialType enum 값 */
export function materialFilterToPrisma(m: MaterialFilter): 'SCS304' | 'SCS316' | undefined {
  if (m === '304') return 'SCS304';
  if (m === '316') return 'SCS316';
  return undefined;
}

export function isScs316(materialType?: string | null): boolean {
  const t = String(materialType || '')
    .trim()
    .toUpperCase();
  return t === 'SCS316' || t === '316';
}

export function materialChipLabel(m: MaterialFilter): string {
  if (m === '304') return '304';
  if (m === '316') return '316';
  return '전체';
}
