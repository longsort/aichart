/**
 * 재고현황·입고대기 빠른찾기 — 압력·사이즈·품번/명칭.
 * 사이즈형 질의(50a)는 150A 등에 부분일치하지 않도록 토큰/정확 매칭.
 */

export type SkuQuickSearchFields = {
  pressureClass?: string | null;
  size?: string | null;
  itemCode?: string | null;
  itemName?: string | null;
  /** 압력 칩 라벨 등 추가 텍스트 */
  extra?: string | null;
};

const SIZE_LIKE = /^\d+a$/i;

function norm(s: string | null | undefined): string {
  return String(s || '')
    .trim()
    .toLowerCase();
}

/** 비영숫자 경계를 둔 토큰 포함 (50a ⊂ 150a 방지) */
export function includesToken(haystack: string, token: string): boolean {
  const h = norm(haystack);
  const t = norm(token);
  if (!t) return true;
  if (!h) return false;
  if (h === t) return true;
  const escaped = t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i').test(h);
}

export function matchesSkuQuickSearch(fields: SkuQuickSearchFields, query: string): boolean {
  const q = norm(query);
  if (!q) return true;

  const size = norm(fields.size);
  const pc = norm(fields.pressureClass);
  const code = norm(fields.itemCode);
  const name = norm(fields.itemName);
  const extra = norm(fields.extra);

  if (SIZE_LIKE.test(q)) {
    return size === q || includesToken(code, q) || includesToken(name, q) || includesToken(extra, q);
  }

  return (
    pc.includes(q) ||
    size.includes(q) ||
    code.includes(q) ||
    name.includes(q) ||
    extra.includes(q) ||
    includesToken(pc, q) ||
    includesToken(size, q)
  );
}
