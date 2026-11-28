/**
 * 플랜지 면·형식 — SOFF / SORF / BLFF / BLRF
 * URL ?face= · 품번 토큰 F-304-SOFF-10K-50A
 */

export const FLANGE_FACE_TYPES = ['SOFF', 'SORF', 'BLFF', 'BLRF'] as const;

export type FlangeFaceType = (typeof FLANGE_FACE_TYPES)[number];

export type FaceFilter = 'ALL' | FlangeFaceType;

const FACE_SET = new Set<string>(FLANGE_FACE_TYPES);

export function isFlangeFaceType(raw?: string | null): raw is FlangeFaceType {
  const v = String(raw || '')
    .trim()
    .toUpperCase();
  return FACE_SET.has(v);
}

export function parseFaceFilter(raw?: string | null): FaceFilter {
  const v = String(raw || '')
    .trim()
    .toUpperCase();
  if (isFlangeFaceType(v)) return v;
  return 'ALL';
}

/** 품번·명칭에서 FACE 토큰 추출 (없으면 null) */
export function extractFaceFromSku(itemCode?: string | null, itemName?: string | null): FlangeFaceType | null {
  const code = String(itemCode || '').toUpperCase();
  for (const f of FLANGE_FACE_TYPES) {
    if (code.includes(`-${f}-`) || code.endsWith(`-${f}`)) return f;
  }
  const name = String(itemName || '').toUpperCase();
  for (const f of FLANGE_FACE_TYPES) {
    if (name.includes(f)) return f;
  }
  return null;
}

/** 필터 매칭 — ALL이면 통과, 아니면 품번/명칭에 FACE 포함 */
export function itemMatchesFaceFilter(
  item: { itemCode?: string | null; itemName?: string | null },
  face: FaceFilter,
): boolean {
  if (face === 'ALL') return true;
  const got = extractFaceFromSku(item.itemCode, item.itemName);
  return got === face;
}

export function faceChipLabel(f: FaceFilter): string {
  if (f === 'ALL') return '전체';
  return f;
}

export function faceTypeTitle(f: FlangeFaceType): string {
  const m: Record<FlangeFaceType, string> = {
    SOFF: 'Slip-On Flat Face (SOFF)',
    SORF: 'Slip-On Raised Face (SORF)',
    BLFF: 'Blind Flat Face (BLFF)',
    BLRF: 'Blind Raised Face (BLRF)',
  };
  return m[f];
}
