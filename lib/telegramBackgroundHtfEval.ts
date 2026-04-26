/**
 * 멀티TF 백그라운드: 열린 차트와 동일 HTF 텔레 판정(상위TF 로켓·라벨근접 뺌).
 * `higherTfRocketBoost` / `lineZoneProximity` / HotZone 눌림봉은 본 감지에 없으면 생략.
 */
import { normalizeChartTimeframe } from '@/lib/constants';
import {
  coerceInstitutionalBandTouchTierMask,
  getEffectiveFeatureToggles,
  institutionalBandTouchMinTierFromMask,
  type UserSettings,
} from '@/lib/settings';
import { collectStructureMarkCandleHighlights } from '@/lib/smcDeskOverlay';
import { sanitizeChartCandlesForSeries } from '@/lib/volumeHistogramIntelligence';
import {
  computeInstitutionalBandInteractionMarkersUnion,
  type InstitutionalBandInteractionMarker,
} from '@/lib/institutionalSuperBand';
import { htfCandleTouchesHotZoneInPool, htfCandleTouchesSupplyDemandStrongInPool } from '@/lib/telegramHtfPoolHelpers';
import { formatInstitutionalBandTouchMarkerDetailText } from '@/lib/telegramInstitutionalText';
import { extractTelegramCpHotLinesFromOverlays } from '@/lib/telegramCpHotExtract';
import type { AnalyzeResponse, Candle, OverlayItem } from '@/types';

export function evaluateBackgroundHtfTelegram(
  analysis: AnalyzeResponse,
  symbol: string,
  timeframe: string,
  settings: UserSettings
): {
  eventKey: string;
  eventText: string;
  eventType: string;
  fullBrief: string;
  cooldownMs: number;
} | null {
  const tfNorm = normalizeChartTimeframe(String(timeframe || ''));
  const sRaw = { ...settings };
  coerceInstitutionalBandTouchTierMask(sRaw);
  const effTog = getEffectiveFeatureToggles(sRaw, 'WHALE');
  const isAiMode = true;
  const whaleCoreSrZoneEnabled = effTog.whaleCoreSrZoneEnabled === true;
  const whalePrecisionEntryEnabled = effTog.whalePrecisionEntryEnabled === true;
  const whalePrecisionAlertEnabled = effTog.whalePrecisionAlertEnabled === true;
  const tfAllowedHtf =
    tfNorm === '1h' || tfNorm === '4h' || tfNorm === '1d' || tfNorm === '1w' || tfNorm === '1M';
  if (!tfAllowedHtf) return null;
  const sUp = String(symbol || '').toUpperCase();
  if (!sUp.startsWith('BTC') && !sUp.startsWith('ETH')) return null;
  const candles: Candle[] = (analysis as any).candles?.length
    ? ((analysis as any).candles as Candle[])
    : [];
  if (candles.length < 2) return null;
  const lastBar = candles[candles.length - 1] as Candle;
  const prevBar = candles[candles.length - 2] as Candle;
  const curBarTime = Number(lastBar.time);
  const prevBarTime = Number(prevBar.time);
  const isRecentSignal = (t: number | null | undefined) =>
    typeof t === 'number' && Number.isFinite(t) && t > 0 && (t === curBarTime || t === prevBarTime);
  const lastK = Math.min(3, Math.max(0, candles.length));
  const recentRocketBarTimes = new Set<number>();
  for (let i = candles.length - lastK; i < candles.length; i++) {
    if (candles[i]) recentRocketBarTimes.add(candles[i].time as number);
  }
  const isRecentSignalRocket = (t: number | null | undefined) => {
    if (typeof t !== 'number' || !Number.isFinite(t) || t <= 0) return false;
    if (isRecentSignal(t)) return true;
    return recentRocketBarTimes.has(t);
  };
  const structureRocketsRaw = (analysis as AnalyzeResponse).structureRocketSignals ?? [];
  const structureRockets = isAiMode && !whaleCoreSrZoneEnabled ? [] : structureRocketsRaw;
  const strongRocketSource = new Set(['bos_retest_both', 'bos_retest_settlement', 'struct_choch_break']);
  const latestRocketForAlert = [...structureRockets]
    .filter((r) => strongRocketSource.has(String((r as any)?.source || '')))
    .sort((a, b) => Number(b.time) - Number(a.time))[0];
  const frontRun = (analysis as any)?.frontRunSignal as
    | { state: 'WATCH' | 'READY' | 'TRIGGERED' | 'INVALID' | 'NO_SIGNAL'; direction: 'LONG' | 'SHORT' | 'NONE'; signalTime?: number }
    | undefined;
  const lsPlan = (analysis as AnalyzeResponse).lsSignalPlan;
  const frontRunSignalTime = Number(frontRun?.signalTime ?? 0);
  const isFrontRunTriggered =
    frontRun?.state === 'TRIGGERED' &&
    (frontRun?.direction === 'LONG' || frontRun?.direction === 'SHORT') &&
    isRecentSignal(frontRunSignalTime);
  const latestPx = Number((lastBar as any).close ?? 0);
  const entryPxRaw = Number(
    (lsPlan as any)?.entry ?? (analysis as AnalyzeResponse)?.frontRunSignal?.entry ?? NaN
  );
  const prepNearPctByTf =
    tfNorm === '1h' ? 0.0028 :
    tfNorm === '4h' ? 0.0036 :
    tfNorm === '1d' ? 0.0046 :
    tfNorm === '1w' ? 0.0048 :
    tfNorm === '1M' ? 0.0052 :
    0.0052;
  const isNearEntryReady =
    Number.isFinite(entryPxRaw) &&
    entryPxRaw > 0 &&
    Number.isFinite(latestPx) &&
    latestPx > 0 &&
    Math.abs(latestPx - entryPxRaw) / entryPxRaw <= prepNearPctByTf;
  const isFrontRunReadyNear =
    frontRun?.state === 'READY' &&
    (frontRun?.direction === 'LONG' || frontRun?.direction === 'SHORT') &&
    isRecentSignal(Number(frontRunSignalTime || curBarTime)) &&
    isNearEntryReady;
  const briefOverlayPool: OverlayItem[] = ((analysis as any).overlays ?? []) as OverlayItem[];
  const latestWhaleLockedBu = [...briefOverlayPool]
    .filter((o) => {
      const id = String(o?.id || '');
      const label = String(o?.label || '');
      return (id.startsWith('whale-auto-bu-ob') || id.startsWith('whale-auto-bu-bb')) && label.includes('(고정)');
    })
    .sort((a, b) => Number(b?.time1 ?? b?.x1 ?? 0) - Number(a?.time1 ?? a?.x1 ?? 0))[0];
  const whaleLockedBuTime = Number(latestWhaleLockedBu?.time1 ?? latestWhaleLockedBu?.x1 ?? 0);
  const isWhaleLockedBuRecent = isRecentSignalRocket(whaleLockedBuTime);
  const aiFusion = (analysis as any)?.aiFusionSignal;
  const aiSide = aiFusion?.verdict === 'LONG' || aiFusion?.verdict === 'SHORT' ? aiFusion.verdict : null;
  const aiTier = String(aiFusion?.tier || '').toLowerCase();
  const frConfidence = Number((analysis as AnalyzeResponse as any)?.frontRunSignal?.confidence ?? 0);
  const frDirection = frontRun?.direction === 'LONG' || frontRun?.direction === 'SHORT' ? frontRun.direction : null;
  const mtfAlign = Number((analysis as AnalyzeResponse as any)?.mtf?.alignmentScore ?? 50);
  const sideBiasBonus = (dir: 'LONG' | 'SHORT') => {
    if (!whalePrecisionEntryEnabled) return 0;
    let v = 0;
    if (aiSide && aiSide === dir) v += aiTier === 'confirmed' ? 10 : aiTier === 'likely' ? 6 : 3;
    if (aiSide && aiSide !== dir) v -= aiTier === 'confirmed' ? 14 : 8;
    if (frDirection && frDirection !== dir && (frontRun?.state === 'READY' || frontRun?.state === 'TRIGGERED')) v -= 10;
    if (mtfAlign >= 78) v += 4;
    if (mtfAlign <= 42) v -= 4;
    return v;
  };
  const confidenceNum = typeof (analysis as any).confidence === 'number' ? Math.round((analysis as any).confidence) : null;
  const timeframeFloor =
    tfNorm === '1h' ? 74 :
    tfNorm === '4h' ? 72 :
    tfNorm === '1d' ? 70 :
    tfNorm === '1w' ? 69 :
    tfNorm === '1M' ? 65 :
    68;
  const tfTag = `[${sUp.startsWith('BTC') ? '#BTC' : '#ETH'} ${String(timeframe).toUpperCase()}]`;
  const precisionAlertOn = isAiMode && whalePrecisionAlertEnabled;
  type C = { type: 'ROCKET' | 'FR_READY' | 'FR_TRIGGERED' | 'WHALE_LOCKED_BU'; key: string; text: string; score: number; direction: 'LONG' | 'SHORT' };
  const candidates: C[] = [];
  if (isFrontRunReadyNear && frDirection) {
    const score = 70 + Math.min(12, frConfidence * 0.16) + sideBiasBonus(frDirection);
    candidates.push({
      type: 'FR_READY',
      key: `FR_READY_NEAR|${symbol}|${timeframe}|${frDirection}|${curBarTime}`,
      text: `${tfTag} [준비알림] ${frDirection === 'LONG' ? '🟡 LONG READY(진입 근접)' : '🟡 SHORT READY(진입 근접)'}`,
      score,
      direction: frDirection,
    });
  }
  if (isFrontRunTriggered && frDirection) {
    const score = 78 + Math.min(16, frConfidence * 0.2) + sideBiasBonus(frDirection);
    candidates.push({
      type: 'FR_TRIGGERED',
      key: `FR_TRIGGERED|${symbol}|${timeframe}|${frDirection}|${frontRunSignalTime}`,
      text: `${tfTag} [선행트리거] ${frDirection === 'LONG' ? '🚀 LONG' : '📉 SHORT'}`,
      score,
      direction: frDirection,
    });
  }
  if (latestWhaleLockedBu && isWhaleLockedBuRecent) {
    const id = String(latestWhaleLockedBu.id || '');
    const isCoreOb = id.startsWith('whale-auto-bu-ob');
    const score = (isCoreOb ? 76 : 72) + sideBiasBonus('LONG');
    candidates.push({
      type: 'WHALE_LOCKED_BU',
      key: `WHALE_LOCKED_BU|${symbol}|${timeframe}|${id}|${whaleLockedBuTime}`,
      text: `${tfTag} ${isCoreOb ? '[매집핵심 고정]' : '[매집준비 고정]'} 🟢 LONG DEFENSE`,
      score,
      direction: 'LONG',
    });
  }
  if (
    latestRocketForAlert &&
    (latestRocketForAlert.direction === 'LONG' || latestRocketForAlert.direction === 'SHORT') &&
    isRecentSignalRocket(Number((latestRocketForAlert as any).time))
  ) {
    const dir = latestRocketForAlert.direction;
    const source = String((latestRocketForAlert as any)?.source || '');
    const sourceBoost =
      source === 'bos_retest_both' ? 11 :
      source === 'bos_retest_settlement' ? 8 :
      source === 'struct_choch_break' ? 6 :
      2;
    const score = 68 + sourceBoost + (confidenceNum != null ? Math.min(12, confidenceNum * 0.12) : 0) + sideBiasBonus(dir);
    candidates.push({
      type: 'ROCKET',
      key: `ROCKET|${symbol}|${timeframe}|${dir}|${Number((latestRocketForAlert as any).time)}`,
      text: `${tfTag} [구조로켓] ${dir === 'LONG' ? '🚀 LONG' : '📉 SHORT'}`,
      score,
      direction: dir,
    });
  }
  const selected = candidates
    .filter((c) => !precisionAlertOn || c.score >= timeframeFloor)
    .sort((a, b) => b.score - a.score)[0];
  let eventKey = '';
  let eventText = '';
  let eventType: 'ROCKET' | 'FR_READY' | 'FR_TRIGGERED' | 'WHALE_LOCKED_BU' | 'HTF_ZPACK' | '' = '';
  if (selected) {
    eventType = selected.type;
    eventKey = selected.key;
    eventText = selected.text;
  }
  const merged = {
    ...sRaw,
    institutionalBandTouchMinTier: institutionalBandTouchMinTierFromMask(sRaw.institutionalBandTouchTierMask),
  };
  const touchMarks = computeInstitutionalBandInteractionMarkersUnion(
    candles as any,
    10,
    3,
    { overlays: briefOverlayPool, tierEnabled: merged.institutionalBandTouchTierMask, minBarsBetween: 8 }
  );
  const ibTouchByBarTime = new Map<number, InstitutionalBandInteractionMarker[]>();
  for (const m of touchMarks) {
    const tm = m.time;
    if (!ibTouchByBarTime.has(tm)) ibTouchByBarTime.set(tm, []);
    ibTouchByBarTime.get(tm)!.push(m);
  }
  let structurePhaseCandleByTime: Map<number, { tag: 'BOS' | 'CHOCH' | 'MSB'; phase: any }> | null = null;
  if (sRaw.chartSmcStructurePhaseCandles !== false) {
    const safe = sanitizeChartCandlesForSeries(candles as any);
    if (safe.length >= 8) {
      const sp = Math.max(2, Math.min(4, Math.floor(sRaw.smcDeskSwingPivot ?? 2)));
      const traceBars = Math.max(0, Math.min(8, Math.floor(sRaw.chartSmcStructureTraceBars ?? 0)));
      structurePhaseCandleByTime = collectStructureMarkCandleHighlights(safe as any, sp, 14, traceBars) as any;
    }
  }
  const htfZOnlyCdMs = tfNorm === '1h' || tfNorm === '4h' ? 300_000 : 600_000;
  const htfSealedOn = sRaw.telegramHtfSealedBarOnly !== false;
  const sealedTime = htfSealedOn && prevBarTime > 0 ? prevBarTime : curBarTime;
  const sealedC = candles.find((c) => Number(c.time) === sealedTime) as any;
  let htfZoneExtraLines: string[] = [];
  if (sRaw.telegramHtfZonePackEnabled !== false && sealedC) {
    const hi = Number(sealedC.high);
    const lo = Number(sealedC.low);
    const htfZTags: string[] = [];
    const zLines: string[] = [];
    const hotPool = htfCandleTouchesHotZoneInPool(briefOverlayPool, { high: hi, low: lo });
    if (hotPool) {
      zLines.push('🔥 HotZone (마감봉·가격대 겹침/핫봉)');
      htfZTags.push('HOTZONE');
    }
    const ibHtf = ibTouchByBarTime.get(sealedTime) ?? [];
    if (ibHtf.length) {
      const head = formatInstitutionalBandTouchMarkerDetailText(ibHtf[0]!);
      zLines.push(`📊 기관밴드(초록/빨강) ${head.length > 160 ? `${head.slice(0, 157)}…` : head}`);
      htfZTags.push('BAND');
    }
    if (htfCandleTouchesSupplyDemandStrongInPool(briefOverlayPool, { high: hi, low: lo })) {
      zLines.push('🧱 수·공급/강한존 봉접촉(초록·빨강·면대)');
      htfZTags.push('ZONE_SR');
    }
    const spHtf = structurePhaseCandleByTime?.get(sealedTime) as any;
    if (spHtf?.phase === 'confirmed') {
      zLines.push(
        `✅ 구조·마감 안착 확정 ${spHtf.tag} ${spHtf.bias === 'bullish' ? '↑' : '↓'}`
      );
      htfZTags.push('SETTLE_OK');
    } else if (spHtf?.phase === 'failed') {
      zLines.push(
        `⛔ 구조·마감 무효(실패) ${spHtf.tag} ${spHtf.bias === 'bullish' ? '↑' : '↓'}`
      );
      htfZTags.push('SETTLE_FAIL');
    }
    if (htfZTags.length) {
      htfZoneExtraLines = zLines;
      if (eventKey) {
        eventKey = `${eventKey}|Z:${[...htfZTags].sort().join('+')}|t:${sealedTime}`;
      } else {
        eventKey = `HTF_ZPACK|${symbol}|${timeframe}|${sealedTime}|${[...htfZTags].sort().join('+')}`;
        eventText = `${tfTag} [HTF·존/밴드] ${htfZTags.join('·')}`;
        eventType = 'HTF_ZPACK';
      }
    }
  }
  if (!eventKey) return null;
  const planFromLs = lsPlan
    ? { entry: Number((lsPlan as any).entry), stop: Number((lsPlan as any).stopLoss), tp1: Number((lsPlan as any).targets?.[0]) }
    : null;
  const { cpLine, hotzoneLine } = extractTelegramCpHotLinesFromOverlays(briefOverlayPool);
  const zonePackNote = sRaw.telegramHtfSealedBarOnly !== false ? '평가봉: 직전 마감(확정 중심)' : '평가봉: 형성 중(필터 약화)';
  const fmtP = (v: number | null | undefined) =>
    typeof v === 'number' && Number.isFinite(v) ? v.toLocaleString(undefined, { maximumFractionDigits: 6 }) : '-';
  const headPrefix = `📡 [멀티TF·백그라운드] (차트 캡처 없음, 본문만)\n${zonePackNote}\n`;
  const fullBrief = [
    headPrefix + eventText,
    ...htfZoneExtraLines,
    `가격: ${Number((lastBar as any).close ?? 0).toLocaleString()}`,
    confidenceNum != null ? `신뢰도: ${confidenceNum}%` : null,
    planFromLs && Number.isFinite(planFromLs.entry)
      ? `진입/손절: ${fmtP(planFromLs.entry)} / ${fmtP(planFromLs.stop)}`
      : null,
    planFromLs && Number.isFinite(planFromLs.entry) && Number.isFinite(planFromLs.tp1) ? `TP1: ${fmtP(planFromLs.tp1)}` : null,
    cpLine,
    hotzoneLine,
    `시간: ${new Date().toLocaleString('ko-KR')}`,
  ]
    .filter(Boolean)
    .join('\n');
  const cooldownMs =
    eventType === 'FR_READY' ? 900_000 : eventType === 'HTF_ZPACK' ? htfZOnlyCdMs : 180_000;
  return { eventKey, eventText, eventType, fullBrief, cooldownMs };
}
