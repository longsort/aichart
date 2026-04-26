/**
 * 차트 존 면색 — `lib/overlayColors.ts`의 SUPPLY / NEUTRAL / WARNING 존 RGB와 매칭되는 항목만 사용자 HEX로 치환.
 * (수요·롱 쪽 초록 존은 사용자 `zoneFillDemandHex`로 치환 가능)
 */

import { defaultSettings, type UserSettings } from '@/lib/settings';

/** 엔진 기본 존과 동일한 기준 RGB (overlayColors DEMAND/NEUTRAL/SUPPLY/WARNING zone 계열) */
const REF_SUPPLY = { r: 239, g: 68, b: 68 };
const REF_NEUTRAL = { r: 59, g: 130, b: 246 };
const REF_WARNING = { r: 234, g: 179, b: 8 };
const REF_DEMAND = { r: 34, g: 197, b: 94 };

const TOL = 26;

function nearRgb(c: { r: number; g: number; b: number }, ref: { r: number; g: number; b: number }): boolean {
  return Math.abs(c.r - ref.r) <= TOL && Math.abs(c.g - ref.g) <= TOL && Math.abs(c.b - ref.b) <= TOL;
}

function parseCssColor(input: string): { r: number; g: number; b: number; a: number } | null {
  const s = input.trim();
  let m = s.match(/^rgba\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)/i);
  if (m) return { r: +m[1], g: +m[2], b: +m[3], a: +m[4] };
  m = s.match(/^rgb\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/i);
  if (m) return { r: +m[1], g: +m[2], b: +m[3], a: 1 };
  m = s.match(/^#([0-9a-f]{6})$/i);
  if (m) {
    const n = parseInt(m[1], 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 1 };
  }
  m = s.match(/^#([0-9a-f]{3})$/i);
  if (m) {
    const x = m[1];
    const r = parseInt(x[0] + x[0], 16);
    const g = parseInt(x[1] + x[1], 16);
    const b = parseInt(x[2] + x[2], 16);
    return { r, g, b, a: 1 };
  }
  return null;
}

export function normalizeZoneFillHex(raw: string | undefined | null): string | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  const m6 = s.match(/^#([0-9a-f]{6})$/i);
  if (m6) return `#${m6[1].toUpperCase()}`;
  const m3 = s.match(/^#([0-9a-f]{3})$/i);
  if (m3) {
    const x = m3[1];
    return `#${x[0]}${x[0]}${x[1]}${x[1]}${x[2]}${x[2]}`.toUpperCase();
  }
  return null;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const n = normalizeZoneFillHex(hex);
  if (!n || n.length !== 7) return null;
  const v = parseInt(n.slice(1), 16);
  if (!Number.isFinite(v)) return null;
  return { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255 };
}

export type ZoneFillUserOpts = {
  supplyHex: string;
  demandHex: string;
  neutralHex: string;
  warningHex: string;
};

export function zoneFillOptsFromSettings(s: UserSettings): ZoneFillUserOpts {
  return {
    supplyHex: normalizeZoneFillHex(s.zoneFillSupplyHex) ?? defaultSettings.zoneFillSupplyHex,
    demandHex: normalizeZoneFillHex(s.zoneFillDemandHex) ?? defaultSettings.zoneFillDemandHex,
    neutralHex: normalizeZoneFillHex(s.zoneFillNeutralHex) ?? defaultSettings.zoneFillNeutralHex,
    warningHex: normalizeZoneFillHex(s.zoneFillWarningHex) ?? defaultSettings.zoneFillWarningHex,
  };
}

/**
 * 공급·숏·저항(빨강), 수요·롱(초록), 중립·진입(파랑), 경고·목표(노랑) 존 치환. 알파는 원본 유지.
 */
export function applyUserZoneFill(color: string | undefined, opts: ZoneFillUserOpts): string | undefined {
  if (!color) return color;
  const p = parseCssColor(color);
  if (!p) return color;
  if (nearRgb(p, REF_DEMAND)) {
    const rgb = hexToRgb(opts.demandHex);
    if (!rgb) return color;
    return `rgba(${rgb.r},${rgb.g},${rgb.b},${p.a})`;
  }
  let hex: string | null = null;
  if (nearRgb(p, REF_SUPPLY)) hex = opts.supplyHex;
  else if (nearRgb(p, REF_NEUTRAL)) hex = opts.neutralHex;
  else if (nearRgb(p, REF_WARNING)) hex = opts.warningHex;
  else return color;
  const rgb = hexToRgb(hex);
  if (!rgb) return color;
  return `rgba(${rgb.r},${rgb.g},${rgb.b},${p.a})`;
}
