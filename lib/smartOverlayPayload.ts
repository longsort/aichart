import type { AnalyzeResponse, Candle, OverlayItem } from '@/types';
import type { SmartOverlayPayload, SmartOverlayZone, SmartOverlayZoneKind } from '@/types/smartOverlay';
import { computeCandleAnalysisConfirmation, confirmationToSmartPayload } from '@/lib/candleAnalysisStructureConfirm';
import { volumeSpikeRecent } from '@/lib/candleAnalysisGuide';
import {
  candleSessionChipFromUnix,
  multiTimeframeChips,
  volatilityInsightChips,
} from '@/lib/candleAnalysisSmartPack';
import { hasCandleAnalysisElliottSketch } from '@/lib/candleAnalysisElliottMvp';
import { buildCandleAnalysisPlaybookPathOverlays } from '@/lib/candleAnalysisPlaybookPath';

function num(x: unknown): number | null {
  const n = typeof x === 'number' ? x : parseFloat(String(x ?? ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function gradeFromConfidence(conf: number, grade?: string | null): string {
  const g = (grade || '').trim().toUpperCase();
  if (g === 'A' || g === 'B' || g === 'C' || g === 'D') return g;
  if (conf >= 85) return 'A';
  if (conf >= 70) return 'B';
  if (conf >= 55) return 'C';
  return 'D';
}

function parseTargetPrices(analysis: AnalyzeResponse): number[] {
  const out: number[] = [];
  for (const t of analysis.targets ?? []) {
    const n = num(t);
    if (n != null) out.push(n);
  }
  for (const t of analysis.nextTargets ?? []) {
    const n = num(t);
    if (n != null) out.push(n);
  }
  return [...new Set(out.map((x) => Math.round(x * 1e8) / 1e8))].sort((a, b) => a - b);
}

function longBias(a: AnalyzeResponse, px: number): boolean {
  if (a.verdict === 'SHORT') return false;
  if (a.verdict === 'LONG') return true;
  const ls = a.longScore ?? 0;
  const ss = a.shortScore ?? 0;
  if (ls !== ss) return ls > ss;
  const e = num(a.entry);
  if (e != null && px > 0) return px >= e * 0.998;
  return true;
}

function bandPad(p: number): number {
  return Math.max(p * 0.001, p * 1e-6);
}

/** 배지: 롱 대기 / 관망 / 숏 주의 / 진입 가능 */
function resolveStatusBadge(analysis: AnalyzeResponse): string {
  const v = analysis.verdict;
  const tapOk = analysis.tapPointConfirmed === true;
  const execOk = analysis.executionState === 'CONFIRMED';
  const swingOk =
    analysis.swingTapPoint?.active === true &&
    analysis.swingTapPoint.direction != null &&
    (analysis.swingTapPoint.confidence ?? 0) >= 55;
  const ready = tapOk || execOk || swingOk;

  if (v === 'LONG') return ready ? '진입 가능' : '롱 대기';
  if (v === 'SHORT') return ready ? '진입 가능' : '숏 주의';
  return '관망';
}

function buildComment(
  analysis: AnalyzeResponse,
  br: number | null,
  entry: number | null,
  isLong: boolean,
  lastClose: number
): string {
  const brReason = analysis.breakoutLevel?.reason?.trim();
  if (brReason) return brReason.length > 96 ? `${brReason.slice(0, 93)}…` : brReason;
  const must = (analysis.mustBreak || analysis.mustHold || '').trim();
  if (must) return must.length > 96 ? `${must.slice(0, 93)}…` : must;
  if (br != null && entry != null) {
    const pxRef = analysis.currentPrice ?? lastClose;
    const cleared = isLong ? pxRef >= br * 0.9995 : pxRef <= br * 1.0005;
    if (cleared) return `${fmtPrice(br)} 돌파 확인 — 1차 진입 구간 점검`;
    return `${fmtPrice(br)} 돌파 확인 시 1차 진입 가능`;
  }
  const s = (analysis.summary || '').replace(/\s+/g, ' ').trim();
  if (s.length) return s.length > 120 ? `${s.slice(0, 117)}…` : s;
  return '차트 존·가격대를 확인하세요.';
}

function fmtPrice(p: number): string {
  if (p >= 1000) return p.toLocaleString('en-US', { maximumFractionDigits: 0 });
  if (p >= 1) return p.toLocaleString('en-US', { maximumFractionDigits: 4 });
  return p.toLocaleString('en-US', { maximumFractionDigits: 6 });
}

const SMART_INSIGHT_CAP = 14;

function pushInsight(out: string[], label: string, max = SMART_INSIGHT_CAP) {
  if (out.length >= max) return;
  const s = label.trim();
  if (!s || out.includes(s)) return;
  out.push(s);
}

/**
 * 캔들분석 스마트 팩 (순서): 세션 → 변동성(ATR) → 상위/하위 TF 화살표 → 존·안착·흐름 등.
 * 기존 엔진 필드만 사용 — 과다 텍스트 방지로 상한 14.
 */
export function buildSmartCandleInsights(analysis: AnalyzeResponse, candles: Candle[]): string[] {
  const out: string[] = [];
  const cap = SMART_INSIGHT_CAP;

  const cre = computeCandleAnalysisConfirmation(candles, analysis);
  if (cre.headline === 'BULL_CONFIRM') {
    pushInsight(out, '★ 상승 확정(구조+종가돌파+유지)', cap);
  } else if (cre.headline === 'BEAR_CONFIRM') {
    pushInsight(out, '★ 하락 확정(구조+종가이탈+유지)', cap);
  } else {
    pushInsight(out, `확정점검 ↑${cre.bull.score}/3 ↓${cre.bear.score}/3`, cap);
  }

  const last = candles[candles.length - 1];
  if (last) pushInsight(out, candleSessionChipFromUnix(last.time as number), cap);
  for (const v of volatilityInsightChips(candles)) pushInsight(out, v, cap);
  for (const v of multiTimeframeChips(analysis)) pushInsight(out, v, cap);

  const st = analysis.settlementZone;
  if (st?.state === 'confirmed') pushInsight(out, '안착 확인', cap);
  else if (st?.state === 'failed') pushInsight(out, '안착 실패', cap);
  else if (st?.state === 'candidate') pushInsight(out, '안착 후보', cap);

  const zs = analysis.zoneSignal;
  if (zs) {
    const zoneKo =
      zs.zone === 'long_confirm' ? '롱 존' : zs.zone === 'short_confirm' ? '숏 존' : '존 관망';
    const bucketKo =
      zs.bucket === 'strong'
        ? '강함'
        : zs.bucket === 'invalid'
          ? '무효'
          : zs.bucket === 'valid'
            ? '유효'
            : '';
    pushInsight(out, bucketKo ? `${zoneKo}·${bucketKo}` : zoneKo, cap);
  }

  const lf = analysis.learningFilter;
  if (lf?.enabled && lf.passed) pushInsight(out, '학습필터 통과', cap);

  const fr = analysis.frontRunSignal;
  if (fr?.state === 'TRIGGERED') pushInsight(out, '선행 트리거', cap);
  else if (fr?.state === 'READY') pushInsight(out, '선행 준비', cap);

  const p3 = analysis.pre3Sparkle;
  if (p3?.matched) pushInsight(out, '유사 과거봉', cap);

  const mtf = analysis.mtf;
  if (mtf && typeof mtf.alignmentScore === 'number') {
    const s = mtf.alignmentScore;
    if (s >= 72) pushInsight(out, `MTF 정렬 ${Math.round(s)}`, cap);
    else if (s <= 38) pushInsight(out, 'MTF 분열', cap);
    else pushInsight(out, `MTF ${Math.round(s)}`, cap);
  }

  const ss = analysis.structureState;
  if (ss?.state === 'trend_up') pushInsight(out, '스윙 상승', cap);
  else if (ss?.state === 'trend_down') pushInsight(out, '스윙 하락', cap);
  else if (ss?.state === 'reversal') pushInsight(out, '전환 구간', cap);
  else if (ss?.state === 'range') pushInsight(out, '레인지', cap);
  else {
    const r = String(analysis.regime || '').trim();
    const regMap: Record<string, string> = {
      trend_up: '추세↑',
      trend_down: '추세↓',
      range: '횡보',
      squeeze: '압축',
      high_volatility: '고변동',
      low_volatility: '저변동',
    };
    if (regMap[r]) pushInsight(out, `레짐 ${regMap[r]}`, cap);
    else if (r) pushInsight(out, `레짐 ${r.length > 10 ? r.slice(0, 10) : r}`, cap);
  }

  const um = analysis.unifiedMarketMetrics;
  if (um) {
    if (um.oiDeltaPct != null && Number.isFinite(um.oiDeltaPct) && Math.abs(um.oiDeltaPct) >= 0.12) {
      const p = um.oiDeltaPct;
      pushInsight(out, `OI ${p >= 0 ? '+' : ''}${p.toFixed(1)}%`, cap);
    }
    const buyV = um.buyVolumeUsd;
    const sellV = um.sellVolumeUsd;
    if (buyV > 0 && sellV > 0) {
      const imb = (buyV - sellV) / (buyV + sellV);
      if (imb >= 0.12) pushInsight(out, '체결 매수 우위', cap);
      else if (imb <= -0.12) pushInsight(out, '체결 매도 우위', cap);
    }
  }

  if (analysis.fundingState === 'positive') pushInsight(out, '펀딩 롱 지불', cap);
  else if (analysis.fundingState === 'negative') pushInsight(out, '펀딩 숏 지불', cap);

  if (analysis.oiState === 'increasing') pushInsight(out, 'OI 증가', cap);
  else if (analysis.oiState === 'decreasing') pushInsight(out, 'OI 감소', cap);

  const als = analysis.adaptiveLearningSignal;
  if (als && als.direction !== 'WATCH' && als.pastWinRate >= 53) {
    pushInsight(out, `유사 맥락 승률 ${Math.round(als.pastWinRate)}%`, cap);
  }

  if (volumeSpikeRecent(candles, 20, 2)) pushInsight(out, '거래량 급증', cap);

  if (hasCandleAnalysisElliottSketch(candles, analysis)) pushInsight(out, '파동 스케치', cap);

  if (buildCandleAnalysisPlaybookPathOverlays(analysis, candles, analysis.timeframe).length > 0) {
    pushInsight(out, '시나리오 경로', cap);
  }

  return out.slice(0, cap);
}

/**
 * AnalyzeResponse + 캔들 → 시각화 전용 JSON.
 * 기존 엔진 필드(entry, targets, nearestBuyZone, breakoutLevel 등)만 사용 (심볼 하드코딩 없음).
 */
export function buildSmartOverlayPayload(
  analysis: AnalyzeResponse | null | undefined,
  candles: Candle[]
): SmartOverlayPayload | null {
  if (!analysis || candles.length < 2) return null;

  const last = candles[candles.length - 1];
  const px = analysis.currentPrice ?? last.close;
  const isLong = longBias(analysis, px);

  const entry = num(analysis.entry);
  const stop = num(analysis.stopLoss);
  const inv = analysis.invalidationLevel?.price != null ? num(analysis.invalidationLevel.price) : null;
  const invalid = inv ?? stop;
  const br = analysis.breakoutLevel?.price != null ? num(analysis.breakoutLevel.price) : null;
  const targets = parseTargetPrices(analysis);
  const tp1 = targets.length ? (isLong ? targets[targets.length - 1] : targets[0]) : null;
  const tp2 =
    targets.length >= 2 ? (isLong ? targets[targets.length - 2] : targets[1]) : targets.length === 1 ? null : null;

  const buyZ = analysis.nearestBuyZone;
  const sellZ = analysis.nearestSellZone;

  let support_zone: [number, number] | null = null;
  let resist_zone: [number, number] | null = null;
  if (isLong && buyZ && buyZ.high > buyZ.low) {
    const pad = Math.max((buyZ.high - buyZ.low) * 0.08, bandPad(buyZ.high));
    support_zone = [buyZ.low - pad, buyZ.high + pad];
  } else if (!isLong && sellZ && sellZ.high > sellZ.low) {
    const pad = Math.max((sellZ.high - sellZ.low) * 0.08, bandPad(sellZ.high));
    resist_zone = [sellZ.low - pad, sellZ.high + pad];
  }

  const zones: SmartOverlayZone[] = [];

  if (support_zone) {
    zones.push({
      type: 'support',
      from: support_zone[0],
      to: support_zone[1],
      label: '바닥·안착 구간',
    });
  }
  if (resist_zone) {
    zones.push({
      type: 'resistance',
      from: resist_zone[0],
      to: resist_zone[1],
      label: '저항 구간',
    });
  }

  const supLv = analysis.supportLevel?.price != null ? num(analysis.supportLevel.price) : null;
  const resLv = analysis.resistanceLevel?.price != null ? num(analysis.resistanceLevel.price) : null;

  function bandContains(lo: number, hi: number, p: number): boolean {
    const a = Math.min(lo, hi);
    const b = Math.max(lo, hi);
    return p >= a && p <= b;
  }

  const sideKo = isLong ? '롱' : '숏';

  if (supLv != null) {
    const inBuy = support_zone && bandContains(support_zone[0], support_zone[1], supLv);
    if (!inBuy) {
      const w = Math.max(bandPad(supLv), Math.abs(supLv) * 3e-6);
      zones.push({ type: 'support', from: supLv - w, to: supLv + w, label: '필수 지지', core: true });
    }
  }
  if (resLv != null) {
    const inSell = resist_zone && bandContains(resist_zone[0], resist_zone[1], resLv);
    if (!inSell) {
      const w = Math.max(bandPad(resLv), Math.abs(resLv) * 3e-6);
      zones.push({ type: 'resistance', from: resLv - w, to: resLv + w, label: '핵심 저항', core: true });
    }
  }

  if (tp1 != null) {
    const w = bandPad(tp1);
    zones.push({ type: 'target', from: tp1 - w, to: tp1 + w, label: '목표 1', core: true });
  }
  if (tp2 != null && tp1 != null && Math.abs(tp2 - tp1) > bandPad(tp1) * 3) {
    const w = bandPad(tp2);
    zones.push({ type: 'target', from: tp2 - w, to: tp2 + w, label: '목표 2' });
  }

  if (entry != null) {
    const w = Math.max(bandPad(entry), Math.abs(px) * 8e-6);
    zones.push({
      type: 'entry',
      from: entry - w,
      to: entry + w,
      label: `1차 진입 · ${sideKo}`,
      core: true,
    });
  }

  if (br != null) {
    const w = Math.max(br * 0.00035, Math.abs(px) * 3e-6);
    zones.push({ type: 'breakout', from: br - w, to: br + w, label: '돌파 확인', core: true });
  }

  if (invalid != null) {
    const w = bandPad(invalid);
    zones.push({ type: 'risk', from: invalid - w, to: invalid + w, label: '무효화' });
  }

  const prob = analysis.probability;
  const longP = Math.round(
    prob?.longProbability ?? analysis.breakoutLevelProbability ?? analysis.breakoutUpsideProbability ?? analysis.confidence ?? 50
  );
  const shortP = Math.round(prob?.shortProbability ?? analysis.invalidationLevelProbability ?? Math.max(0, 100 - longP));

  const confNum = analysis.confidence ?? 50;
  const confirmationRaw = computeCandleAnalysisConfirmation(candles, analysis);
  const confirmation = confirmationToSmartPayload(confirmationRaw);

  return {
    schemaVersion: 'smart-overlay-v1',
    symbol: analysis.symbol,
    timeframe: analysis.timeframe,
    price: px,
    status: resolveStatusBadge(analysis),
    confidence: gradeFromConfidence(confNum, analysis.confidenceGrade),
    prob_long: longP,
    prob_short: shortP,
    support_zone,
    resist_zone,
    entry_1: entry,
    breakout_level: br,
    invalid,
    tp1,
    tp2,
    zones,
    comment: buildComment(analysis, br, entry, isLong, last.close),
    insights: buildSmartCandleInsights(analysis, candles),
    confirmation,
  };
}

const SMART_ZONE_STYLE: Record<
  SmartOverlayZoneKind,
  { fill: string; line: string }
> = {
  support: { fill: 'rgba(34,197,94,0.09)', line: '#4ade80' },
  resistance: { fill: 'rgba(239,68,68,0.09)', line: '#fb7185' },
  entry: { fill: 'rgba(234,179,8,0.14)', line: '#facc15' },
  risk: { fill: 'rgba(185,28,28,0.15)', line: '#f87171' },
  target: { fill: 'rgba(239,68,68,0.14)', line: '#fb7185' },
  breakout: { fill: 'rgba(96,165,250,0.12)', line: '#93c5fd' },
  bpr: { fill: 'rgba(168,85,247,0.1)', line: '#c084fc' },
  fvg: { fill: 'rgba(56,189,248,0.08)', line: '#38bdf8' },
  ob: { fill: 'rgba(251,146,60,0.1)', line: '#fb923c' },
};

/**
 * 캔들분석 차트: API `smartOverlay` → 기존 zone 오버레이(가격·시간 범위 동일 규칙).
 */
export function smartOverlayZonesToOverlays(payload: SmartOverlayPayload, candles: Candle[]): OverlayItem[] {
  if (!candles.length || !payload.zones.length) return [];
  const t1 = candles[0].time as number;
  const t2 = candles[candles.length - 1].time as number;
  const out: OverlayItem[] = [];
  payload.zones.forEach((z, i) => {
    const hi = Math.max(z.from, z.to);
    const lo = Math.min(z.from, z.to);
    if (!(hi > lo)) return;
    const st = SMART_ZONE_STYLE[z.type] ?? SMART_ZONE_STYLE.support;
    out.push({
      id: `smart-overlay-zone-${z.type}-${i}`,
      kind: 'zone',
      label: z.label,
      confidence: 70,
      x1: 0,
      y1: 0,
      x2: 1,
      y2: 1,
      time1: t1,
      time2: t2,
      price1: hi,
      price2: lo,
      color: st.fill,
      lineLabelColor: st.line,
      category: 'labels',
      zonePulse: z.core === true,
    });
  });
  return out;
}

const EXEC_ZONE_TYPES = new Set<SmartOverlayZoneKind>(['support', 'resistance', 'breakout', 'entry', 'target', 'risk']);

/**
 * 캔들분석 핵심 뷰: core 표시 존만(없으면 지지·저항·돌파·진입·목표·리스크 타입만).
 */
export function smartOverlayZonesToExecutiveOverlays(payload: SmartOverlayPayload, candles: Candle[]): OverlayItem[] {
  const full = smartOverlayZonesToOverlays(payload, candles);
  if (!full.length) return [];
  const hasCore = payload.zones.some((z) => z.core === true);
  const keep = new Set(
    payload.zones
      .map((z, i) => ({ z, i }))
      .filter(({ z }) => (hasCore ? z.core === true : EXEC_ZONE_TYPES.has(z.type)))
      .map(({ z, i }) => `smart-overlay-zone-${z.type}-${i}`)
  );
  return full.filter((o) => keep.has(o.id));
}
