/**
 * 재고현황·입고대기·모피 큐 빠른찾기.
 * - 공백 분리·단일 토큰
 * - 압축 질의: `50A20BL`, `20K50A`, `50A20BLRF` (사이즈·압력·FACE, 순서 무관, K 생략 가능)
 * - 사이즈형(50a)은 150A 부분일치 방지
 */

import { FLANGE_FACE_TYPES } from '@/lib/wms/flange-face';

export type SkuQuickSearchFields = {
  pressureClass?: string | null;
  size?: string | null;
  itemCode?: string | null;
  itemName?: string | null;
  /** 압력 칩 라벨 등 추가 텍스트 */
  extra?: string | null;
};

export type CompactSkuTokens = {
  sizes: string[];
  /** 정규화 압력 토큰: 20k / 20 / 40bar / ansi150 … */
  pressures: string[];
  /** face 전체(blrf) 또는 접두(bl, so) */
  faces: string[];
  remainder: string;
};

const SIZE_LIKE = /^\d+a$/i;
const FACE_FULL = [...FLANGE_FACE_TYPES].map((f) => f.toLowerCase()).sort((a, b) => b.length - a.length);

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

/**
 * 압축 질의에서 사이즈·압력·FACE 토큰 추출.
 * 예: 50a20bl → sizes[50a] pressures[20] faces[bl]
 */
export function parseCompactSkuQuery(query: string): CompactSkuTokens {
  let q = norm(query).replace(/[\s,_./-]+/g, '');
  const sizes: string[] = [];
  const pressures: string[] = [];
  const faces: string[] = [];

  // FACE 전체 코드 먼저 (긴 것 우선)
  for (const f of FACE_FULL) {
    if (q.includes(f)) {
      faces.push(f);
      q = q.split(f).join('');
    }
  }

  // 사이즈 NNa
  q = q.replace(/(\d+)a/gi, (_m, n: string) => {
    sizes.push(`${n}a`);
    return '';
  });

  // 압력 with unit
  q = q.replace(/(\d+)k(?:g(?:f)?(?:cm)?²?)?/gi, (_m, n: string) => {
    pressures.push(`${n}k`);
    return '';
  });
  q = q.replace(/(\d+)bar/gi, (_m, n: string) => {
    pressures.push(`${n}bar`);
    return '';
  });
  q = q.replace(/ansi(\d+)/gi, (_m, n: string) => {
    pressures.push(`ansi${n}`);
    return '';
  });
  q = q.replace(/class(\d+)/gi, (_m, n: string) => {
    pressures.push(`class${n}`);
    return '';
  });

  // FACE 접두 (전체 미추출 시) — bl / so / rf / ff
  if (faces.length === 0) {
    const prefixHit = q.match(/(blff|blrf|soff|sorf|bl|so|ff|rf)/i);
    if (prefixHit) {
      const p = prefixHit[1]!.toLowerCase();
      faces.push(p);
      q = q.replace(prefixHit[1]!, '');
    }
  }

  // 남은 숫자 = 압력(K 생략: 20 → 20k 후보)
  q = q.replace(/(\d+)/g, (_m, n: string) => {
    pressures.push(n);
    return '';
  });

  return {
    sizes,
    pressures,
    faces,
    remainder: q.replace(/[^a-z0-9가-힣]/gi, ''),
  };
}

function pressureMatches(pressureClass: string, token: string): boolean {
  const pc = norm(pressureClass).replace(/\s+/g, '');
  const t = norm(token);
  if (!t) return true;
  if (!pc) return false;
  if (pc === t) return true;
  if (pc.includes(t)) return true;

  // 20 / 20k ↔ 20K / 20kg/cm²
  const bare = t.replace(/k$/i, '');
  if (/^\d+$/.test(bare)) {
    if (new RegExp(`(^|[^0-9])${bare}k([^a-z0-9]|$)`, 'i').test(pc)) return true;
    if (new RegExp(`(^|[^0-9])${bare}(?:kg|kgf)`, 'i').test(pc)) return true;
    if (pc === `${bare}k` || pc.startsWith(`${bare}k`)) return true;
  }
  // 40bar
  if (/^\d+bar$/.test(t) && pc.includes(t.replace('bar', '') + 'bar')) return true;
  if (/^\d+$/.test(t) && new RegExp(`(^|[^0-9])${t}bar`, 'i').test(pc)) return true;

  return false;
}

function faceMatches(
  fields: SkuQuickSearchFields,
  faceToken: string,
): boolean {
  const t = norm(faceToken);
  if (!t) return true;
  const code = norm(fields.itemCode);
  const name = norm(fields.itemName);
  const extra = norm(fields.extra);
  if (code.includes(t) || name.includes(t) || extra.includes(t)) return true;

  // 접두: bl → blff|blrf, so → soff|sorf, ff → *ff, rf → *rf
  for (const f of FACE_FULL) {
    if (!f.startsWith(t) && !f.endsWith(t) && f !== t) continue;
    if (code.includes(f) || name.includes(f) || includesToken(code, f)) return true;
  }
  return false;
}

function matchesCompactTokens(fields: SkuQuickSearchFields, tokens: CompactSkuTokens): boolean {
  const size = norm(fields.size);
  const code = norm(fields.itemCode);
  const name = norm(fields.itemName);
  const extra = norm(fields.extra);
  const pc = norm(fields.pressureClass);

  for (const s of tokens.sizes) {
    if (size === s || includesToken(code, s) || includesToken(name, s) || includesToken(extra, s)) {
      continue;
    }
    return false;
  }

  for (const p of tokens.pressures) {
    if (
      pressureMatches(pc, p) ||
      includesToken(code, p) ||
      includesToken(code, `${p}k`) ||
      includesToken(name, p) ||
      includesToken(extra, p)
    ) {
      continue;
    }
    // bare 20 also try as 20k in code
    if (/^\d+$/.test(p) && (includesToken(code, `${p}k`) || code.includes(`${p}k`))) continue;
    return false;
  }

  for (const f of tokens.faces) {
    if (!faceMatches(fields, f)) return false;
  }

  if (tokens.remainder) {
    const r = tokens.remainder;
    if (!(pc.includes(r) || size.includes(r) || code.includes(r) || name.includes(r) || extra.includes(r))) {
      return false;
    }
  }

  return true;
}

export function matchesSkuQuickSearch(fields: SkuQuickSearchFields, query: string): boolean {
  const q = norm(query);
  if (!q) return true;

  const size = norm(fields.size);
  const pc = norm(fields.pressureClass);
  const code = norm(fields.itemCode);
  const name = norm(fields.itemName);
  const extra = norm(fields.extra);

  // 단일 사이즈 토큰
  if (SIZE_LIKE.test(q)) {
    return size === q || includesToken(code, q) || includesToken(name, q) || includesToken(extra, q);
  }

  // 압축·복합 토큰 (공백 제거 후 사이즈/압력/FACE가 하나라도 있으면 AND 매칭)
  const compact = parseCompactSkuQuery(q);
  const hasCompact =
    compact.sizes.length > 0 || compact.pressures.length > 0 || compact.faces.length > 0;
  if (hasCompact) {
    return matchesCompactTokens(fields, compact);
  }

  // 공백 분리 다중 토큰 → 모두 만족
  const parts = q.split(/[\s,+/|]+/).filter(Boolean);
  if (parts.length > 1) {
    return parts.every((part) => matchesSkuQuickSearch(fields, part));
  }

  return (
    pc.includes(q) ||
    size.includes(q) ||
    code.includes(q) ||
    name.includes(q) ||
    extra.includes(q) ||
    includesToken(pc, q) ||
    includesToken(size, q) ||
    pressureMatches(pc, q) ||
    faceMatches(fields, q)
  );
}
