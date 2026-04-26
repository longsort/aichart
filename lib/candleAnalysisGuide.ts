import type { AnalyzeResponse, Candle, OverlayItem } from '@/types';

const BAND_PAD_RATIO = 0.001;
/** 돌파선용 얇은 띠 */
const BREAKOUT_PAD_RATIO = 0.00035;

function num(x: unknown): number | null {
  const n = typeof x === 'number' ? x : parseFloat(String(x ?? ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function fmtPrice(p: number): string {
  if (p >= 1000) return p.toLocaleString('en-US', { maximumFractionDigits: 0 });
  if (p >= 1) return p.toLocaleString('en-US', { maximumFractionDigits: 4 });
  return p.toLocaleString('en-US', { maximumFractionDigits: 6 });
}

function bandPad(p: number): number {
  return Math.max(p * BAND_PAD_RATIO, p * 1e-6);
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

/** 차트 존 라벨은 짧게 — 가격은 Y축 눈금으로 표시 */
function entryZoneLabelShort(
  breakout: number | null,
  px: number,
  isLong: boolean
): string {
  const br = breakout;
  if (isLong && br != null) {
    const cleared = px >= br * 0.9995;
    return cleared ? '진입 ✓' : '진입';
  }
  if (!isLong && br != null) {
    const cleared = px <= br * 1.0005;
    return cleared ? '진입 ✓' : '진입';
  }
  return '진입';
}

/**
 * 캔들분석 모드 전용: 분석 API 값으로만 가로 존(목표·진입·무효화) 생성. 심볼 고정값 없음.
 */
export function buildCandleAnalysisGuideZones(analysis: AnalyzeResponse | null | undefined, candles: Candle[]): OverlayItem[] {
  if (!analysis || candles.length < 2) return [];
  const t1 = candles[0].time as number;
  const t2 = candles[candles.length - 1].time as number;
  const last = candles[candles.length - 1];
  const px = last.close;
  const isLong = longBias(analysis, px);

  const entry = num(analysis.entry);
  const stop = num(analysis.stopLoss);
  const targets = parseTargetPrices(analysis);
  const tp1 = targets.length ? (isLong ? targets[targets.length - 1] : targets[0]) : null;
  const tpAlt = targets.length >= 2 ? (isLong ? targets[targets.length - 2] : targets[1]) : null;
  const br = analysis.breakoutLevel?.price != null ? num(analysis.breakoutLevel.price) : null;
  const inv = analysis.invalidationLevel?.price != null ? num(analysis.invalidationLevel.price) : null;
  const stopPrice = inv ?? stop;
  const buyZ = analysis.nearestBuyZone;
  const sellZ = analysis.nearestSellZone;

  /** 뒤에서 앞으로 겹침: 넓은 맥락 → 목표 → 진입·돌파 → 무효(최상단) */
  const out: OverlayItem[] = [];

  if (isLong && buyZ && buyZ.high > buyZ.low) {
    const pad = Math.max((buyZ.high - buyZ.low) * 0.08, bandPad(buyZ.high));
    out.push({
      id: 'candle-analysis-zone-support',
      kind: 'zone',
      label: '지지·롱',
      confidence: Math.min(95, buyZ.probability ?? 70),
      x1: 0,
      y1: 0,
      x2: 1,
      y2: 1,
      time1: t1,
      time2: t2,
      price1: buyZ.high + pad,
      price2: buyZ.low - pad,
      color: 'rgba(34,197,94,0.11)',
      lineLabelColor: '#22c55e',
      category: 'labels',
    });
  }
  if (!isLong && sellZ && sellZ.high > sellZ.low) {
    const pad = Math.max((sellZ.high - sellZ.low) * 0.08, bandPad(sellZ.high));
    out.push({
      id: 'candle-analysis-zone-resist',
      kind: 'zone',
      label: '저항·숏',
      confidence: Math.min(95, sellZ.probability ?? 70),
      x1: 0,
      y1: 0,
      x2: 1,
      y2: 1,
      time1: t1,
      time2: t2,
      price1: sellZ.high + pad,
      price2: sellZ.low - pad,
      color: 'rgba(239,68,68,0.11)',
      lineLabelColor: '#f43f5e',
      category: 'labels',
    });
  }

  const supLv = analysis.supportLevel?.price != null ? num(analysis.supportLevel.price) : null;
  const resLv = analysis.resistanceLevel?.price != null ? num(analysis.resistanceLevel.price) : null;
  const inBuyMacro =
    isLong && buyZ && supLv != null && supLv >= buyZ.low - bandPad(buyZ.low) && supLv <= buyZ.high + bandPad(buyZ.high);
  const inSellMacro =
    !isLong && sellZ && resLv != null && resLv >= sellZ.low - bandPad(sellZ.low) && resLv <= sellZ.high + bandPad(sellZ.high);
  if (supLv != null && !inBuyMacro) {
    const w = Math.max(bandPad(supLv), Math.abs(supLv) * 3e-6);
    out.push({
      id: 'candle-analysis-zone-key-support',
      kind: 'zone',
      label: isLong ? '핵심 지지·롱' : '핵심 지지',
      confidence: Math.min(92, analysis.supportLevelProbability ?? 78),
      x1: 0,
      y1: 0,
      x2: 1,
      y2: 1,
      time1: t1,
      time2: t2,
      price1: supLv + w,
      price2: supLv - w,
      color: isLong ? 'rgba(16,185,129,0.14)' : 'rgba(34,197,94,0.12)',
      lineLabelColor: isLong ? '#10b981' : '#4ade80',
      category: 'labels',
      zonePulse: true,
    });
  }
  if (resLv != null && !inSellMacro) {
    const w = Math.max(bandPad(resLv), Math.abs(resLv) * 3e-6);
    out.push({
      id: 'candle-analysis-zone-key-resist',
      kind: 'zone',
      label: !isLong ? '핵심 저항·숏' : '핵심 저항',
      confidence: Math.min(92, analysis.resistanceLevelProbability ?? 78),
      x1: 0,
      y1: 0,
      x2: 1,
      y2: 1,
      time1: t1,
      time2: t2,
      price1: resLv + w,
      price2: resLv - w,
      color: !isLong ? 'rgba(244,63,94,0.14)' : 'rgba(239,68,68,0.11)',
      lineLabelColor: !isLong ? '#fb7185' : '#f87171',
      category: 'labels',
      zonePulse: true,
    });
  }

  if (tp1 != null) {
    const w = bandPad(tp1);
    out.push({
      id: 'candle-analysis-zone-target',
      kind: 'zone',
      label: isLong ? '목표·롱' : '목표·숏',
      confidence: 70,
      x1: 0,
      y1: 0,
      x2: 1,
      y2: 1,
      time1: t1,
      time2: t2,
      price1: tp1 + w,
      price2: tp1 - w,
      color: isLong ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
      lineLabelColor: isLong ? '#4ade80' : '#fb7185',
      category: 'labels',
      zonePulse: true,
    });
  }

  if (tpAlt != null && tp1 != null && Math.abs(tpAlt - tp1) > bandPad(tp1) * 3) {
    const w = bandPad(tpAlt);
    const cleared = isLong ? px >= tpAlt : px <= tpAlt;
    out.push({
      id: 'candle-analysis-zone-milestone',
      kind: 'zone',
      label: cleared ? '2차 ✓' : '2차',
      confidence: 65,
      x1: 0,
      y1: 0,
      x2: 1,
      y2: 1,
      time1: t1,
      time2: t2,
      price1: tpAlt + w,
      price2: tpAlt - w,
      color: cleared ? 'rgba(34,197,94,0.1)' : 'rgba(251,191,36,0.11)',
      lineLabelColor: cleared ? '#4ade80' : '#fbbf24',
      category: 'labels',
    });
  }

  if (entry != null) {
    const w = Math.max(bandPad(entry), Math.abs(px) * 8e-6);
    const sideKo = isLong ? '롱' : '숏';
    out.push({
      id: 'candle-analysis-zone-entry',
      kind: 'zone',
      label: `${entryZoneLabelShort(br, px, isLong)} · ${sideKo}`,
      confidence: 78,
      x1: 0,
      y1: 0,
      x2: 1,
      y2: 1,
      time1: t1,
      time2: t2,
      price1: entry + w,
      price2: entry - w,
      color: isLong ? 'rgba(250,204,21,0.16)' : 'rgba(251,146,60,0.16)',
      lineLabelColor: isLong ? '#eab308' : '#fb923c',
      category: 'labels',
      zonePulse: true,
    });
  }

  if (br != null) {
    const w = Math.max(br * BREAKOUT_PAD_RATIO, Math.abs(px) * 3e-6);
    out.push({
      id: 'candle-analysis-zone-breakout',
      kind: 'zone',
      label: isLong ? '돌파·롱' : '돌파·숏',
      confidence: 66,
      x1: 0,
      y1: 0,
      x2: 1,
      y2: 1,
      time1: t1,
      time2: t2,
      price1: br + w,
      price2: br - w,
      color: isLong ? 'rgba(56,189,248,0.13)' : 'rgba(249,115,22,0.13)',
      lineLabelColor: isLong ? '#38bdf8' : '#f97316',
      category: 'labels',
      zonePulse: true,
    });
  }

  if (stopPrice != null) {
    const w = bandPad(stopPrice);
    out.push({
      id: 'candle-analysis-zone-invalidation',
      kind: 'zone',
      label: isLong ? '무효·롱 손절' : '무효·숏 손절',
      confidence: 72,
      x1: 0,
      y1: 0,
      x2: 1,
      y2: 1,
      time1: t1,
      time2: t2,
      price1: stopPrice + w,
      price2: stopPrice - w,
      color: 'rgba(185,28,28,0.15)',
      lineLabelColor: '#f87171',
      category: 'labels',
    });
  }

  return out;
}

export function volumeSpikeRecent(candles: Candle[], lookback = 20, mult = 2): boolean {
  if (candles.length < lookback + 1) return false;
  const slice = candles.slice(-lookback - 1, -1);
  const vols = slice.map((c) => c.volume).filter((v) => v > 0);
  if (!vols.length) return false;
  const mean = vols.reduce((a, b) => a + b, 0) / vols.length;
  const lastV = candles[candles.length - 1]?.volume ?? 0;
  return mean > 0 && lastV >= mean * mult;
}

/** 캔들분석 UI: 롱/숏/관망을 헤더·플로팅 배지에서 동일 규칙으로 표시 */
export type CandleAnalysisDirection = {
  kind: 'LONG' | 'SHORT' | 'WATCH';
  lean: 'LONG' | 'SHORT' | null;
  headlineEn: string;
  headlineKo: string;
  subLine: string;
  color: string;
  glow: string;
};

export function resolveCandleAnalysisDirection(analysis: AnalyzeResponse): CandleAnalysisDirection {
  const cs = (analysis as { confirmedSignal?: { confirmed?: boolean; direction?: string } }).confirmedSignal;
  const confirmed = cs?.confirmed === true;
  const cdir = (cs?.direction || '').toUpperCase();
  const v = analysis.verdict;
  const ls = analysis.longScore ?? 0;
  const ss = analysis.shortScore ?? 0;
  const gap = 3;
  let lean: 'LONG' | 'SHORT' | null = null;
  if (ls > ss + gap) lean = 'LONG';
  else if (ss > ls + gap) lean = 'SHORT';

  if (v === 'LONG') {
    return {
      kind: 'LONG',
      lean: 'LONG',
      headlineEn: 'LONG',
      headlineKo: '롱',
      subLine: confirmed && cdir === 'LONG' ? '실행 확정 · 브리핑과 동일 방향' : '신호 대기 · 존·가격 확인',
      color: '#4ade80',
      glow: 'rgba(34,197,94,0.5)',
    };
  }
  if (v === 'SHORT') {
    return {
      kind: 'SHORT',
      lean: 'SHORT',
      headlineEn: 'SHORT',
      headlineKo: '숏',
      subLine: confirmed && cdir === 'SHORT' ? '실행 확정 · 브리핑과 동일 방향' : '신호 대기 · 존·가격 확인',
      color: '#f87171',
      glow: 'rgba(239,68,68,0.5)',
    };
  }
  const leanKo = lean === 'LONG' ? '롱 쪽 우위' : lean === 'SHORT' ? '숏 쪽 우위' : '롱·숏 엇비슷';
  const leanEn = lean === 'LONG' ? 'LEAN LONG' : lean === 'SHORT' ? 'LEAN SHORT' : 'NO LEAN';
  return {
    kind: 'WATCH',
    lean,
    headlineEn: leanEn,
    headlineKo: '관망',
    subLine: `${leanKo} · 확정 롱/숏 대기`,
    color: '#fbbf24',
    glow: 'rgba(251,191,36,0.4)',
  };
}

export type CandleAnalysisSituationLine = { text: string; tone: 'neutral' | 'ok' | 'warn' | 'bad' };

/** 캔들분석 상세: 다음 관심가 · 안착(유지) · 거래량 급증 후 성패 힌트 — API 필드 + 최근 봉 휴리스틱 */
export function computeCandleAnalysisSituation(analysis: AnalyzeResponse, candles: Candle[]): CandleAnalysisSituationLine[] {
  const out: CandleAnalysisSituationLine[] = [];
  if (!candles.length) return out;

  const last = candles[candles.length - 1];
  const prev = candles.length >= 2 ? candles[candles.length - 2] : last;
  const px = last.close;
  const v = analysis.verdict;
  const isLong = v === 'LONG' || (v === 'WATCH' && (analysis.longScore ?? 0) >= (analysis.shortScore ?? 0));

  const br = analysis.breakoutLevel?.price;
  const inv = analysis.invalidationLevel?.price;
  const t0 = analysis.targets?.[0] != null ? num(analysis.targets[0]) : null;
  const t1 = analysis.targets?.[1] != null ? num(analysis.targets[1]) : null;

  if (t0 != null) {
    const hit = isLong ? px >= t0 * 0.999 : px <= t0 * 1.001;
    out.push({
      text: `다음 목표(1차) ${fmtPrice(t0)} · ${hit ? '가격 도달/근접' : isLong ? '위로 확장 시 안착·추세 확인' : '아래 확장 시 관심'}`,
      tone: hit ? 'ok' : 'neutral',
    });
  }
  if (t1 != null && t0 != null && Math.abs(t1 - t0) > px * 1e-6) {
    out.push({
      text: `차기 스텝 ${fmtPrice(t1)} · 1차 ${isLong ? '안착 후' : '이탈 후'} 추적`,
      tone: 'neutral',
    });
  }

  if (br != null) {
    const cleared = isLong ? px >= br : px <= br;
    out.push({
      text: `돌파 기준 ${fmtPrice(br)} · 현재 ${cleared ? '기준 위(유지 확인 중)' : '기준 미돌파(대기)'}`,
      tone: cleared ? 'ok' : 'warn',
    });
  }
  if (inv != null) {
    const failed = isLong ? px < inv : px > inv;
    out.push({
      text: `무효화·손절 근처 ${fmtPrice(inv)} · ${failed ? '⚠ 시나리오 약화 구간' : '아직 이탈 전'}`,
      tone: failed ? 'bad' : 'neutral',
    });
  }

  const eh = analysis.entryHoldProbability;
  if (eh != null && Number.isFinite(eh)) {
    out.push({
      text: `엔트리대 유지·안착 추정 ${Math.round(eh)}% (오더북·체결 기반, collect 시 보강)`,
      tone: eh >= 65 ? 'ok' : eh >= 45 ? 'warn' : 'bad',
    });
  }

  const buyZ = analysis.nearestBuyZone;
  const sellZ = analysis.nearestSellZone;
  if (isLong && buyZ?.holdProbability != null) {
    out.push({
      text: `근접 매수(지지) 구간 유지 ${Math.round(buyZ.holdProbability)}% · ${fmtPrice(buyZ.low)}~${fmtPrice(buyZ.high)}`,
      tone: buyZ.holdProbability >= 60 ? 'ok' : 'neutral',
    });
  }
  if (!isLong && sellZ?.holdProbability != null) {
    out.push({
      text: `근접 매도(저항) 구간 저항 ${Math.round(sellZ.holdProbability)}% · ${fmtPrice(sellZ.low)}~${fmtPrice(sellZ.high)}`,
      tone: sellZ.holdProbability >= 60 ? 'ok' : 'neutral',
    });
  }
  if (buyZ?.closeSettleProbability != null && isLong) {
    out.push({
      text: `종가 안착 추정(매수존 근처) ${Math.round(buyZ.closeSettleProbability)}%`,
      tone: 'neutral',
    });
  }

  const daily = (analysis as { dailyState?: string }).dailyState;
  const weekly = (analysis as { weeklyState?: string }).weeklyState;
  if (daily) {
    const ok = daily === 'accepted_above';
    const bad = daily === 'accepted_below';
    out.push({
      text: `일봉 종가선: ${ok ? '위 안착' : bad ? '아래' : daily === 'reclaiming' ? '재진입' : String(daily)}`,
      tone: ok ? 'ok' : bad ? 'bad' : 'neutral',
    });
  }
  if (weekly && weekly !== daily) {
    const ok = weekly === 'accepted_above';
    out.push({
      text: `주봉 종가선: ${ok ? '위 안착' : weekly === 'accepted_below' ? '아래' : weekly}`,
      tone: ok ? 'ok' : 'neutral',
    });
  }

  const spike = volumeSpikeRecent(candles, 20, 2);
  if (spike) {
    const bullBar = last.close >= last.open;
    let follow: CandleAnalysisSituationLine['tone'] = 'warn';
    let msg = '최근 봉 거래량 급증 · ';
    if (br != null) {
      const holdAbove = isLong ? last.close >= br && bullBar : last.close <= br && !bullBar;
      msg += holdAbove
        ? isLong
          ? '돌파가 위·강한 종가 → 안착 시도로 해석 가능'
          : '돌파 아래·약한 종가 → 이탈 시도로 해석 가능'
        : isLong
          ? '돌파가 대비 약한 마감 → 실패/되돌림 가능성 점검'
          : '기준가 대비 반등 마감 → 숏 약화 가능성 점검';
      follow = holdAbove ? 'ok' : 'warn';
    } else {
      msg += bullBar ? '매수 체결 우위 봉' : '매도 체결 우위 봉';
      follow = 'neutral';
    }
    out.push({ text: msg, tone: follow });
  } else {
    out.push({ text: '거래량: 최근 20봉 평균 대비 급증 신호 없음 · 돌파는 거래량 동반 시 신뢰↑', tone: 'neutral' });
  }

  if (prev && prev.close > 0) {
    const chg = ((last.close - prev.close) / prev.close) * 100;
    if (Math.abs(chg) > 0.25) {
      out.push({
        text: `직전 봉 대비 ${chg >= 0 ? '+' : ''}${chg.toFixed(2)}% · 변동성 ${Math.abs(chg) > 1.2 ? '큼' : '보통'}`,
        tone: 'neutral',
      });
    }
  }

  return out;
}
