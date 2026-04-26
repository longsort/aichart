/**
 * 멀티TF 백그라운드: 메인 화면과 동일 /api/analyze 쿼리(고래급, collect=0).
 * 클라이언트에서만 import (loadSettings()).
 */
import { DEFAULT_PARKF_TRENDLINE_COLORS, normalizeHex6 } from '@/lib/chartHexColor';
import { parkfEngineOptsToQueryDiff } from '@/lib/parkfAnalyzeQuery';
import {
  loadSettings,
  defaultSettings,
  getEffectiveFeatureToggles,
  effectiveChartPrimeChannelWidthScale,
  type UIMode,
  type UserSettings,
} from '@/lib/settings';

/** HomePageContent `chart-major-zone-*`와 동일 — UserSettings에 없고 메인 화면 state·localStorage에만 있음 */
function readChartMajorZoneForQuery(): { w: number; o: number; t: number } {
  const d = { w: 1.0, o: 0.24, t: 2 };
  if (typeof window === 'undefined') return d;
  try {
    const wr = window.localStorage.getItem('chart-major-zone-width');
    const or = window.localStorage.getItem('chart-major-zone-opacity');
    const tr = window.localStorage.getItem('chart-major-zone-touches');
    const w = wr != null ? Number.parseFloat(wr) : d.w;
    const o = or != null ? Number.parseFloat(or) : d.o;
    const t = tr != null ? Number.parseInt(tr, 10) : d.t;
    return {
      w: Number.isFinite(w) ? Math.max(0.6, Math.min(2.0, w)) : d.w,
      o: Number.isFinite(o) ? Math.max(0.08, Math.min(0.55, o)) : d.o,
      t: Number.isFinite(t) ? Math.max(2, Math.min(6, t)) : d.t,
    };
  } catch {
    return d;
  }
}

function enc(h: string) {
  return encodeURIComponent(h.replace(/^#/, '').slice(0, 6));
}
function parkfQ(s: UserSettings) {
  return `&pfB=${enc(
    normalizeHex6(s.parkfLinRegBaseHex, defaultSettings.parkfLinRegBaseHex)
  )}&pfLg=${enc(
    normalizeHex6(s.parkfLinRegLargeHex, defaultSettings.parkfLinRegLargeHex)
  )}&pfMd=${enc(
    normalizeHex6(s.parkfLinRegMediumHex, defaultSettings.parkfLinRegMediumHex)
  )}&pfSm=${enc(
    normalizeHex6(s.parkfLinRegSmallHex, defaultSettings.parkfLinRegSmallHex)
  )}&pfTp=${enc(
    normalizeHex6(s.parkfTrendPrimaryHex, defaultSettings.parkfTrendPrimaryHex)
  )}&pfTs=${enc(
    normalizeHex6(s.parkfTrendSecondaryHex, defaultSettings.parkfTrendSecondaryHex)
  )}`;
}

/**
 * SSR/PM2·크론: 병합된 `UserSettings`(서버 저장분 등)로 `/api/analyze` 쿼리 생성.
 * @param modeUi 고래 툴킷 기준: 기본 `WHALE` (amx=1, 고래 feature 토글).
 */
export function buildTelegramBackgroundAnalyzeUrlWithSettings(
  s: UserSettings,
  symbol: string,
  timeframe: string,
  modeUi: UIMode = 'WHALE',
  majorOverride?: { w: number; o: number; t: number }
): string {
  const uiMode: UIMode = modeUi;
  const sAi = s;
  const mz = majorOverride ?? readChartMajorZoneForQuery();
  const aiAvg = sAi.aiCompressionAvgRangeAtr ?? defaultSettings.aiCompressionAvgRangeAtr;
  const aiMax = sAi.aiCompressionMaxRangeAtr ?? defaultSettings.aiCompressionMaxRangeAtr;
  const aiImpR = sAi.aiImpulseRangeAtr ?? defaultSettings.aiImpulseRangeAtr;
  const aiImpB = sAi.aiImpulseBodyAtr ?? defaultSettings.aiImpulseBodyAtr;
  const aiVol = sAi.aiCompressionVolumeFilter === true ? 1 : 0;
  const amx = 1;
  const effCp = getEffectiveFeatureToggles(s, uiMode);
  const cpVolBg = effCp.chartPrimeTrendChannelsVolumeBg === true ? 1 : 0;
  const cpLen = Math.max(2, Math.min(30, Math.round(Number(sAi.chartPrimeTrendChannelsLength) || 8)));
  const cpAuto = sAi.chartPrimeTrendChannelsAutoLength !== false ? 1 : 0;
  const cpWait = sAi.chartPrimeTrendChannelsWait !== false ? 1 : 0;
  const cpExt = sAi.chartPrimeTrendChannelsExtend === true ? 1 : 0;
  const cpShowLast = sAi.chartPrimeTrendChannelsShowLastOnly !== false ? 1 : 0;
  const cpFill = sAi.chartPrimeTrendChannelsShowFills !== false ? 1 : 0;
  const cpTop = normalizeHex6(sAi.chartPrimeTrendChannelsTopHex, defaultSettings.chartPrimeTrendChannelsTopHex).replace(
    /^#/,
    ''
  );
  const cpCtr = normalizeHex6(
    sAi.chartPrimeTrendChannelsCenterHex,
    defaultSettings.chartPrimeTrendChannelsCenterHex
  ).replace(/^#/, '');
  const cpBot = normalizeHex6(sAi.chartPrimeTrendChannelsBottomHex, defaultSettings.chartPrimeTrendChannelsBottomHex).replace(
    /^#/,
    ''
  );
  const cpW = effectiveChartPrimeChannelWidthScale(sAi);
  const ddF = sAi.chartDepthDeltaRegimeFilter === false ? 0 : 1;
  const ddW = sAi.chartDepthDeltaAlignmentWeight === false ? 0 : 1;
  const ddT = sAi.chartDepthDeltaTpAdaptive === false ? 0 : 1;
  const pfe = sAi.parkfEngineOpts && typeof sAi.parkfEngineOpts === 'object' ? sAi.parkfEngineOpts : {};
  const pfEngineQ = parkfEngineOptsToQueryDiff(pfe);
  return (
    `/api/analyze?symbol=${encodeURIComponent(String(symbol).toUpperCase())}&timeframe=${encodeURIComponent(timeframe)}&collect=0&zoneSensitivity=${encodeURIComponent(
      (sAi.zoneSignalSensitivity ?? 1).toFixed(2)
    )}&majorZoneWidth=${encodeURIComponent(
      mz.w.toFixed(2)
    )}&majorZoneOpacity=${encodeURIComponent(
      mz.o.toFixed(2)
    )}&majorZoneTouches=${encodeURIComponent(String(mz.t))}&structureBreakout=${
      sAi.structureBreakoutRocketWithoutRetest ? 1 : 0
    }&trendlineLookback=${encodeURIComponent(
      String(Math.max(2, Math.min(15, Math.round(sAi.trendlineLookback ?? 3))))
    )}&pre3Sim=${encodeURIComponent(
      (sAi.pre3SimilarityThreshold ?? 1).toFixed(3)
    )}&pre3Close=${sAi.pre3ConfirmOnCloseOnly !== false ? 1 : 0}&aiAvg=${encodeURIComponent(aiAvg.toFixed(2))}&aiMax=${encodeURIComponent(aiMax.toFixed(2))}&aiImpR=${encodeURIComponent(
      aiImpR.toFixed(2)
    )}&aiImpB=${encodeURIComponent(aiImpB.toFixed(2))}&aiVol=${aiVol}${amx ? '&amx=1' : ''}&cpLen=${cpLen}&cpAuto=${cpAuto}&cpWait=${cpWait}&cpExt=${cpExt}&cpShowLast=${cpShowLast}&cpFill=${cpFill}&cpTop=${cpTop}&cpCtr=${cpCtr}&cpBot=${cpBot}&cpW=${encodeURIComponent(
      cpW.toFixed(4)
    )}&ddF=${ddF}&ddW=${ddW}&ddT=${ddT}${
      cpVolBg ? '&cpVolBg=1' : ''
    }${parkfQ(sAi)}${pfEngineQ}`
  );
}

/**
 * 브라우저: `loadSettings()`(localStorage) 기준 쿼리. 서버/크론은 `buildTelegramBackgroundAnalyzeUrlWithSettings` 사용.
 */
export function buildTelegramBackgroundAnalyzeUrl(
  symbol: string,
  timeframe: string,
  modeUi: UIMode = 'WHALE'
): string {
  return buildTelegramBackgroundAnalyzeUrlWithSettings(loadSettings(), symbol, timeframe, modeUi);
}
