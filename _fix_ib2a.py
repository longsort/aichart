from pathlib import Path

# 1) settings
p = Path(r"d:/apps/ailongshort/lib/settings.ts")
t = p.read_text(encoding="utf-8")
old = """  /** 타점엔진 공동 — SFP 스윕회수 마커 ON/OFF (타점 전용) */
  tapointSharedSfpEnabled: boolean;
"""
new = """  /** 타점엔진 공동 — SFP 스윕회수 마커 ON/OFF (타점 전용) */
  tapointSharedSfpEnabled: boolean;
  /**
   * 타점 기관밴드2 — 통합분석 SuperTrend 초록↔빨강 전환선 (존상·존하 쌍선과 별개).
   */
  tapointSharedInstitutionalBand2Enabled: boolean;
"""
if old not in t:
    raise SystemExit('settings type missing')
t = t.replace(old, new, 1)
t = t.replace(
"""  tapointSharedSfpEnabled: true,
""",
"""  tapointSharedSfpEnabled: true,
  tapointSharedInstitutionalBand2Enabled: true,
""",
1,
)
t = t.replace(
"""      tapointSharedSfpEnabled: settings.tapointSharedSfpEnabled !== false,
""",
"""      tapointSharedSfpEnabled: settings.tapointSharedSfpEnabled !== false,
      tapointSharedInstitutionalBand2Enabled:
        settings.tapointSharedInstitutionalBand2Enabled !== false,
""",
1,
)
p.write_text(t, encoding="utf-8")
print("settings ok")

# 2) chips
c = Path(r"d:/apps/ailongshort/lib/tapointSharedMergedFeatures.ts")
ct = c.read_text(encoding="utf-8")
ct = ct.replace(
"""export type TapointSharedMergedFeatureId =
  | 'institutionalBand'
  | 'mtfDumpZone'
  | 'structureRocket'
  | 'cartBasket'
  | 'sfp';
""",
"""export type TapointSharedMergedFeatureId =
  | 'institutionalBand'
  | 'institutionalBand2'
  | 'mtfDumpZone'
  | 'structureRocket'
  | 'cartBasket'
  | 'sfp';
""",
1,
)
ct = ct.replace(
"""  {
    id: 'institutionalBand',
    labelKo: '기관밴드',
    hintKo: 'ST 계단선 + LH/SH 터치 마커 · 통합·분석과 동일 엔진',
    settingsKey: 'chartMergedInstitutionalBandEnabled',
  },
""",
"""  {
    id: 'institutionalBand',
    labelKo: '기관밴드',
    hintKo: 'ST 존상·존하 쌍선(채널형) + LH/SH 터치 · 기존 유지',
    settingsKey: 'chartMergedInstitutionalBandEnabled',
  },
  {
    id: 'institutionalBand2',
    labelKo: '기관밴드2',
    hintKo: '통합분석 SuperTrend · 롱=초록 / 숏=빨강 전환선',
    settingsKey: 'tapointSharedInstitutionalBand2Enabled',
  },
""",
1,
)
ct = ct.replace(
"""export type TapointSharedMergedFeatureFlags = {
  institutionalBand: boolean;
  mtfDumpZone: boolean;
  structureRocket: boolean;
  cartBasket: boolean;
  sfp: boolean;
};
""",
"""export type TapointSharedMergedFeatureFlags = {
  institutionalBand: boolean;
  institutionalBand2: boolean;
  mtfDumpZone: boolean;
  structureRocket: boolean;
  cartBasket: boolean;
  sfp: boolean;
};
""",
1,
)
ct = ct.replace(
"""  return {
    institutionalBand: s.chartMergedInstitutionalBandEnabled !== false,
    mtfDumpZone: s.chartMergedDeskMtfDumpZoneEnabled !== false,
    structureRocket: s.chartMarkerLayerRocket !== false,
    cartBasket: s.tapointSharedCartBasketEnabled !== false,
    sfp: s.tapointSharedSfpEnabled !== false,
  };
""",
"""  return {
    institutionalBand: s.chartMergedInstitutionalBandEnabled !== false,
    institutionalBand2: s.tapointSharedInstitutionalBand2Enabled !== false,
    mtfDumpZone: s.chartMergedDeskMtfDumpZoneEnabled !== false,
    structureRocket: s.chartMarkerLayerRocket !== false,
    cartBasket: s.tapointSharedCartBasketEnabled !== false,
    sfp: s.tapointSharedSfpEnabled !== false,
  };
""",
1,
)
ct = ct.replace(
"""const FLAG_TO_KEY: Record<TapointSharedMergedFeatureId, keyof UserSettings> = {
  institutionalBand: 'chartMergedInstitutionalBandEnabled',
  mtfDumpZone: 'chartMergedDeskMtfDumpZoneEnabled',
  structureRocket: 'chartMarkerLayerRocket',
  cartBasket: 'tapointSharedCartBasketEnabled',
  sfp: 'tapointSharedSfpEnabled',
};
""",
"""const FLAG_TO_KEY: Record<TapointSharedMergedFeatureId, keyof UserSettings> = {
  institutionalBand: 'chartMergedInstitutionalBandEnabled',
  institutionalBand2: 'tapointSharedInstitutionalBand2Enabled',
  mtfDumpZone: 'chartMergedDeskMtfDumpZoneEnabled',
  structureRocket: 'chartMarkerLayerRocket',
  cartBasket: 'tapointSharedCartBasketEnabled',
  sfp: 'tapointSharedSfpEnabled',
};
""",
1,
)
c.write_text(ct, encoding="utf-8")
print("chips ok")

# 3) builder for band2 — active ST line only
b = Path(r"d:/apps/ailongshort/lib/eagle1Tapoint/buildTapointSharedMergedLayers.ts")
bt = b.read_text(encoding="utf-8")
bt = bt.replace(
"""  computeInstitutionalSuperTrendEnvelopeSegmentsByTrend,
  institutionalBandTouchMinGapBars,
} from '@/lib/institutionalSuperBand';
""",
"""  computeInstitutionalSuperTrendEnvelopeSegmentsByTrend,
  institutionalBandTouchMinGapBars,
} from '@/lib/institutionalSuperBand';
import { institutionalEnvelopeParamsForTf } from '@/lib/mergedDeskEnvelopeMtfLink';
""",
1,
)

insert_after = """export function buildTapointInstitutionalBandSegments(
  candles: Candle[]
): TapointInstBandSegment[] {
"""
# add new types + function after existing TapointInstBandSegment type and before buildTapointInstitutionalBandSegments
# Actually add AFTER the whole buildTapointInstitutionalBandSegments function ends

marker = """export function buildTapointMtfDumpZoneBands("""
band2 = """/** 기관밴드2 — 통합분석식 SuperTrend 활성선만 (롱=하단초록 · 숏=상단빨강) */
export type TapointInstBand2Segment = {
  dir: 'long' | 'short';
  points: TapointInstBandLinePoint[];
};

export function buildTapointInstitutionalBand2Segments(
  candles: Candle[],
  chartTf?: string
): TapointInstBand2Segment[] {
  if (!candles || candles.length < 8) return [];
  try {
    const { period, mult } = institutionalEnvelopeParamsForTf(chartTf || null);
    const segs = computeInstitutionalSuperTrendEnvelopeSegmentsByTrend(candles, period, mult);
    return segs
      .map((s) => {
        const raw = s.dir === 'long' ? s.lower : s.upper;
        const points = (raw || [])
          .map((p) => ({
            time: Number(p.time),
            value: Number(p.value),
          }))
          .filter((p) => p.time > 0 && p.value > 0);
        return { dir: s.dir, points };
      })
      .filter((s) => s.points.length >= 2);
  } catch {
    return [];
  }
}

"""
if "buildTapointInstitutionalBand2Segments" not in bt:
    if marker not in bt:
        raise SystemExit('mtf marker missing')
    bt = bt.replace(marker, band2 + marker, 1)
b.write_text(bt, encoding="utf-8")
print("builder ok")
