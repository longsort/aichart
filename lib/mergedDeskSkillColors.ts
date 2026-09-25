/**
 * 스킬창 색상 — 사용자 지정 (#RRGGBB).
 * 롱/숏/대기/강조/칩ON·OFF. 확정 수익 아님.
 */
export type SkillColorPack = {
  longHex: string;
  shortHex: string;
  waitHex: string;
  accentHex: string;
  pillOnHex: string;
  pillOffHex: string;
  updatedAt: number;
};

const KEY = 'ailongshort.mergedDesk.skillColors.v1';

export const DEFAULT_SKILL_COLORS: SkillColorPack = {
  longHex: '#34d399',
  shortHex: '#f87171',
  waitHex: '#94a3b8',
  accentHex: '#38bdf8',
  pillOnHex: '#a7f3d0',
  pillOffHex: '#64748b',
  updatedAt: 0,
};

function normHex(v: unknown, fallback: string): string {
  const s = String(v || '').trim().toUpperCase();
  if (/^#[0-9A-F]{6}$/.test(s)) return s;
  if (/^[0-9A-F]{6}$/.test(s)) return `#${s}`;
  return fallback;
}

export function normalizeSkillColors(
  raw: Partial<SkillColorPack> | null | undefined
): SkillColorPack {
  const d = DEFAULT_SKILL_COLORS;
  if (!raw || typeof raw !== 'object') return { ...d };
  return {
    longHex: normHex(raw.longHex, d.longHex),
    shortHex: normHex(raw.shortHex, d.shortHex),
    waitHex: normHex(raw.waitHex, d.waitHex),
    accentHex: normHex(raw.accentHex, d.accentHex),
    pillOnHex: normHex(raw.pillOnHex, d.pillOnHex),
    pillOffHex: normHex(raw.pillOffHex, d.pillOffHex),
    updatedAt: Number(raw.updatedAt) > 0 ? Number(raw.updatedAt) : d.updatedAt,
  };
}

export function readSkillColors(): SkillColorPack {
  if (typeof window === 'undefined') return { ...DEFAULT_SKILL_COLORS };
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_SKILL_COLORS };
    return normalizeSkillColors(JSON.parse(raw) as Partial<SkillColorPack>);
  } catch {
    return { ...DEFAULT_SKILL_COLORS };
  }
}

export function writeSkillColors(patch: Partial<SkillColorPack>): SkillColorPack {
  const next = normalizeSkillColors({
    ...readSkillColors(),
    ...patch,
    updatedAt: Date.now(),
  });
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  }
  return next;
}

export function skillColorsToCssVars(c: SkillColorPack): Record<string, string> {
  return {
    '--skill-long': c.longHex,
    '--skill-short': c.shortHex,
    '--skill-wait': c.waitHex,
    '--skill-accent': c.accentHex,
    '--skill-pill-on': c.pillOnHex,
    '--skill-pill-off': c.pillOffHex,
  };
}

export const SKILL_COLOR_FIELDS: Array<{
  key: keyof Omit<SkillColorPack, 'updatedAt'>;
  labelKo: string;
}> = [
  { key: 'longHex', labelKo: '롱' },
  { key: 'shortHex', labelKo: '숏' },
  { key: 'waitHex', labelKo: '대기' },
  { key: 'accentHex', labelKo: '강조' },
  { key: 'pillOnHex', labelKo: '칩ON' },
  { key: 'pillOffHex', labelKo: '칩OFF' },
];
