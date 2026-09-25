/**
 * 폭락존 — 사용자 면색·테두리·면라벨 크기.
 * TF(분·시·일·주·달) 문구는 엔진 라벨 유지 · 색/크기만 덮어씀.
 */
import { loadSettings } from '@/lib/settings';

export type DumpZoneUserStyle = {
  colorMode: 'auto' | 'custom';
  fillHex: string;
  borderHex: string;
  fillRgba: string;
  faceLabelFontSize: number;
  edgePriceFontSize: number;
  edgePriceColor: string;
};

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(String(hex || '').trim());
  if (!m) return null;
  const n = parseInt(m[1]!, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function dumpZoneHexToRgba(hex: string, alpha = 0.14): string {
  const rgb = hexToRgb(hex) || { r: 56, g: 189, b: 248 };
  const a = Math.max(0.04, Math.min(0.45, alpha));
  return `rgba(${rgb.r},${rgb.g},${rgb.b},${a})`;
}

export function readDumpZoneUserStyle(
  s = loadSettings()
): DumpZoneUserStyle {
  const fill =
    typeof s.chartMergedDeskDumpZoneFillColor === 'string' &&
    /^#[0-9a-fA-F]{6}$/.test(s.chartMergedDeskDumpZoneFillColor)
      ? s.chartMergedDeskDumpZoneFillColor
      : '#38bdf8';
  const border =
    typeof s.chartMergedDeskDumpZoneBorderColor === 'string' &&
    /^#[0-9a-fA-F]{6}$/.test(s.chartMergedDeskDumpZoneBorderColor)
      ? s.chartMergedDeskDumpZoneBorderColor
      : fill;
  const faceFs = Number(s.chartMergedDeskDumpFaceLabelFontSize);
  const edgeFs = Number(s.chartMergedDeskDumpEdgePriceFontSize);
  const edgeCol =
    typeof s.chartMergedDeskDumpEdgePriceColor === 'string' &&
    /^#[0-9a-fA-F]{6}$/.test(s.chartMergedDeskDumpEdgePriceColor)
      ? s.chartMergedDeskDumpEdgePriceColor
      : '#fef08a';
  return {
    colorMode: s.chartMergedDeskDumpZoneColorMode === 'auto' ? 'auto' : 'custom',
    fillHex: fill,
    borderHex: border,
    fillRgba: dumpZoneHexToRgba(fill, 0.14),
    faceLabelFontSize: Number.isFinite(faceFs)
      ? Math.max(7, Math.min(18, Math.round(faceFs)))
      : 9,
    edgePriceFontSize: Number.isFinite(edgeFs)
      ? Math.max(7, Math.min(18, Math.round(edgeFs)))
      : 8,
    edgePriceColor: edgeCol,
  };
}
