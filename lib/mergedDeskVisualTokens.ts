/**
 * 통합·분석 차트 시각 토큰 — 라벨 위치는 유지, 존 fill/테두리·글꼴만.
 * `.cursor/skills/merged-desk-visual-design`
 */

export const MERGED_DESK_VISUAL = {
  font:
    '"Pretendard Variable", Pretendard, "IBM Plex Sans KR", "Noto Sans KR", system-ui, sans-serif',
  labelBg: 'rgba(8,10,14,0.72)',
  supply: { fill: 'rgba(232,93,93,0.14)', stroke: 'rgba(232,93,93,0.85)', rgb: [232, 93, 93] as const },
  demand: { fill: 'rgba(46,201,183,0.14)', stroke: 'rgba(46,201,183,0.85)', rgb: [46, 201, 183] as const },
  gold: { fill: 'rgba(196,163,90,0.14)', stroke: 'rgba(196,163,90,0.90)', rgb: [196, 163, 90] as const },
  confluence: { fill: 'rgba(196,163,90,0.18)', stroke: 'rgba(212,181,106,0.92)', rgb: [212, 181, 106] as const },
  channel: { fill: 'rgba(61,220,151,0.10)', stroke: 'rgba(61,220,151,0.85)', rgb: [61, 220, 151] as const },
} as const;

type ZoneRole = 'supply' | 'demand' | 'gold' | 'channel' | 'other';

function parseCssColor(input: string): { r: number; g: number; b: number; a: number } | null {
  const s = input.trim();
  let m = s.match(/^rgba\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)/i);
  if (m) return { r: +m[1]!, g: +m[2]!, b: +m[3]!, a: +m[4]! };
  m = s.match(/^rgb\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/i);
  if (m) return { r: +m[1]!, g: +m[2]!, b: +m[3]!, a: 1 };
  m = s.match(/^#([0-9a-f]{6})$/i);
  if (m) {
    const n = parseInt(m[1]!, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 1 };
  }
  return null;
}

function classifyZoneHue(r: number, g: number, b: number): ZoneRole {
  const gold =
    r >= 150 && g >= 110 && b <= 150 && r - b >= 30 && g - b >= 16 && Math.abs(r - g) <= 80;
  if (gold) return 'gold';
  const channel = g >= r + 18 && g >= b + 8 && g >= 140 && b <= 200 && r <= 140;
  if (channel) return 'channel';
  const demand = g >= 80 && b >= 70 && g + b >= r * 1.45 && r <= 160;
  if (demand) return 'demand';
  const supply = r >= g + 12 && r >= b + 12 && r >= 140;
  if (supply) return 'supply';
  return 'other';
}

function pack(rgb: readonly [number, number, number], a: number): string {
  return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a})`;
}

/** 존 면 — 숏존과 동일 농도(fill 14%). 색상(hue)은 유지. */
export function applyMergedDeskVisualZonePaint(color: string | undefined): string | undefined {
  if (color == null || color === 'transparent' || color === 'none') return color;
  const p = parseCssColor(color);
  if (!p) return color;
  return `rgba(${p.r},${p.g},${p.b},0.14)`;
}

export function applyMergedDeskVisualZoneStroke(color: string | undefined): string | undefined {
  if (color == null || color === 'transparent' || color === 'none') return color;
  const p = parseCssColor(color);
  if (!p) return 'rgba(148,163,184,0.55)';
  return `rgba(${p.r},${p.g},${p.b},0.85)`;
}

export function mergedDeskVisualZoneBackground(
  fill: string | undefined,
  enabled: boolean
): string | undefined {
  if (!enabled) return fill;
  return applyMergedDeskVisualZonePaint(fill) ?? fill;
}

export function mergedDeskVisualZoneBorder(
  border: string | undefined,
  fill: string | undefined,
  enabled: boolean
): string | undefined {
  if (!enabled) return border;
  if (border === 'none') return border;
  const stroke = applyMergedDeskVisualZoneStroke(fill);
  if (!stroke) return border;
  if (!border) return `1px solid ${stroke}`;
  if (/\bdashed\b/i.test(border)) return `1px dashed ${stroke}`;
  return `1px solid ${stroke}`;
}
