/**
 * 타점 차트 — 전투구간(Battle Zone) 면/테두리 사용자 설정 적용.
 */
import { loadSettings } from '@/lib/settings';
import type { TapointChartSignals } from '@/lib/eagle1Tapoint/chartSignals';

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(String(hex || '').trim());
  if (!m) return null;
  const n = parseInt(m[1]!, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function applyTapointBattleZoneStyle(
  signals: TapointChartSignals | null | undefined
): TapointChartSignals | null {
  if (!signals) return null;
  const s = loadSettings();
  const opRaw = Number(s.tapointBattleZoneFillOpacity);
  /** 면이 완전 투명하면 전투구간이 ‘사라진 것처럼’ 보이므로 최소 10% */
  const op = Math.max(
    10,
    Math.min(100, Math.round(Number.isFinite(opRaw) ? opRaw : 14))
  );
  const border =
    typeof s.tapointBattleZoneBorderColor === 'string' &&
    /^#[0-9a-fA-F]{6}$/.test(s.tapointBattleZoneBorderColor)
      ? s.tapointBattleZoneBorderColor
      : '#facc15';
  const rgb = hexToRgb(border) || { r: 250, g: 204, b: 21 };
  const alpha = op / 100;
  const fill = `rgba(${rgb.r},${rgb.g},${rgb.b},${alpha})`;
  const zones = (signals.zones || []).map((z) => {
    if (z.kind !== 'battle') return z;
    return {
      ...z,
      fill,
      stroke: border,
    };
  });
  return { ...signals, zones };
}
