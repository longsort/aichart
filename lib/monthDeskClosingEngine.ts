/**
 * 마감·안착 데스크: 상위 TF(MTF) 요약·세션 기준 문구·최근 판정 분포·참고 강도(0~100) 합성.
 * 교육·HUD 보조 — 확정 신호·승률·손익 보장 아님.
 */
import type { AnalyzeResponse, Candle } from '@/types';
import {
  computeClosingEnvelopeVerdictMarkers,
  INSTITUTIONAL_BAND_DEFAULT_MULT,
  INSTITUTIONAL_BAND_DEFAULT_PERIOD,
  type ClosingEnvelopeFuturesBias,
  type ClosingEnvelopeFuturesScenario,
  type ClosingEnvelopeVerdictKo,
} from '@/lib/institutionalSuperBand';
import type { MonthDeskStructurePick } from '@/lib/monthDeskStructureHud';

export type MonthDeskSessionBasis = 'chart_candle' | 'utc_calendar';

export function monthDeskSessionBasisLabelKo(basis: MonthDeskSessionBasis): string {
  if (basis === 'utc_calendar') {
    return '세션 기준: UTC 일 경계 근사 — 거래소 정식 정산·데이라이트와 다를 수 있음(참고).';
  }
  return '세션 기준: 차트 캔들 종가(선택 TF) — 해당 봉이 판정 입력.';
}

type HtfVsChart = 'stacked' | 'conflict' | 'unclear';

function biasToDir(b: ClosingEnvelopeFuturesBias): 'long' | 'short' | null {
  if (b === 'LONG') return 'long';
  if (b === 'SHORT') return 'short';
  return null;
}

function htfBiasToDir(htfBias: string | undefined): 'long' | 'short' | 'range' | null {
  const x = String(htfBias || '').toLowerCase();
  if (x === 'bullish' || x.includes('long')) return 'long';
  if (x === 'bearish' || x.includes('short')) return 'short';
  if (x === 'range' || x.includes('횡보')) return 'range';
  return null;
}

function normalizeAlignmentScore(raw: number | undefined): number | null {
  if (raw == null || !Number.isFinite(raw)) return null;
  const a = Number(raw);
  if (a >= 0 && a <= 1) return Math.round(a * 100);
  return Math.max(0, Math.min(100, Math.round(a)));
}

function countVerdicts(markers: Array<{ verdict: ClosingEnvelopeVerdictKo }>): {
  ok: number;
  fail: number;
  nervous: number;
} {
  let ok = 0;
  let fail = 0;
  let nervous = 0;
  for (const m of markers) {
    if (m.verdict === '안착') ok++;
    else if (m.verdict === '실패') fail++;
    else nervous++;
  }
  return { ok, fail, nervous };
}

/** 우측 패널「과거 검증」— 차트 TF 캔들 패킷 기준, 한 번의 ST 코어로 여러 창만 슬라이스 */
export type MonthDeskVerdictValidationWindow = {
  bars: number;
  ok: number;
  fail: number;
  nervous: number;
};

export type MonthDeskVerdictValidationSummary = {
  chartTf: string;
  windows: MonthDeskVerdictValidationWindow[];
  footnote: string;
};

export function computeMonthDeskVerdictValidationSummary(
  candles: Candle[],
  chartTf?: string
): MonthDeskVerdictValidationSummary | null {
  if (candles.length < 12) return null;
  const want = Math.min(800, Math.max(48, candles.length));
  const markers = computeClosingEnvelopeVerdictMarkers(candles, undefined, undefined, {
    recentBars: want,
    recentBarsMax: 800,
  });
  if (!markers.length) return null;
  const L = markers.length;
  const rawTargets = [96, 240, L];
  const seen = new Set<number>();
  const windows: MonthDeskVerdictValidationWindow[] = [];
  for (const w of rawTargets) {
    const eff = Math.min(w, L);
    if (eff < 12) continue;
    if (seen.has(eff)) continue;
    seen.add(eff);
    const slice = markers.slice(-eff);
    const c = countVerdicts(slice);
    windows.push({ bars: eff, ...c });
  }
  const tf = String(chartTf || '').trim() || '차트 TF';
  const footnote = `차트 패킷 캔들 · SuperTrend(${INSTITUTIONAL_BAND_DEFAULT_PERIOD},${INSTITUTIONAL_BAND_DEFAULT_MULT}) 종가 휴리스틱 — 참고용, 승률·확정 신호 아님.`;
  return { chartTf: tf, windows, footnote };
}

/**
 * 마감존 시나리오 HUD에 붙일 추가 불릿 + 참고 강도(휴리스틱).
 */
export function computeMonthDeskClosingHudAugmentation(params: {
  scenario: ClosingEnvelopeFuturesScenario | null;
  analysis: AnalyzeResponse | null | undefined;
  structurePick: MonthDeskStructurePick | null;
  candles: Candle[];
  sessionBasis: MonthDeskSessionBasis;
}): {
  extraBullets: string[];
  referenceStrength0to100: number;
  referenceStrengthLineKo: string;
} {
  const { scenario, analysis, structurePick, candles, sessionBasis } = params;
  const extra: string[] = [monthDeskSessionBasisLabelKo(sessionBasis)];

  const mtf = analysis?.mtf;
  let htfVs: HtfVsChart = 'unclear';
  if (scenario && mtf?.htfBias) {
    const cd = biasToDir(scenario.bias);
    const hd = htfBiasToDir(mtf.htfBias);
    if (cd && hd === 'long' && cd === 'long') htfVs = 'stacked';
    else if (cd && hd === 'short' && cd === 'short') htfVs = 'stacked';
    else if (cd && (hd === 'long' || hd === 'short') && hd !== cd) htfVs = 'conflict';
    else if (hd === 'range') htfVs = 'unclear';

    if (mtf.summary && String(mtf.summary).trim()) {
      extra.push(`MTF 요약: ${String(mtf.summary).trim()}`);
    } else if (htfVs === 'stacked') {
      extra.push('상위 TF(분석 MTF)와 차트 마감존 편향이 같은 방향(참고).');
    } else if (htfVs === 'conflict') {
      extra.push('상위 TF(분석 MTF)와 마감존 편향이 엇갈림 — 상위·체결 별도 확인 권장.');
    } else {
      extra.push(`상위 TF: HTF ${String(mtf.htfBias)} — 차트 TF와 가름 필요.`);
    }
  } else if (mtf?.htfBias || mtf?.summary) {
    if (mtf.summary && String(mtf.summary).trim()) {
      extra.push(`MTF: ${String(mtf.summary).trim()}`);
    } else if (mtf.htfBias) {
      extra.push(`MTF HTF: ${String(mtf.htfBias)} — 차트 마감존과 별도로 가름.`);
    }
  } else {
    const multi = (analysis as { multiTF?: { htf?: string | null; htfLabel?: string } } | null)?.multiTF;
    if (multi?.htf) {
      const lab = multi.htfLabel ? `${multi.htfLabel} ` : '';
      extra.push(`상위 TF(보조): ${lab}${multi.htf}`);
    } else {
      extra.push('상위 TF: 분석 패킷에 MTF 요약 없음 — 차트 TF만 사용.');
    }
  }

  if (candles.length >= 12) {
    const markers = computeClosingEnvelopeVerdictMarkers(candles, undefined, undefined, { recentBars: 96 });
    const { ok: a, fail: f, nervous: u } = countVerdicts(markers);
    const n = markers.length || 1;
    extra.push(`최근 ${n}봉 마감존 판정(참고): 안착 ${a} · 실패 ${f} · 불안 ${u}`);
  }

  let score = 52;
  const al = normalizeAlignmentScore(mtf?.alignmentScore);
  if (al != null) score = Math.round((score + al) / 2);
  if (htfVs === 'stacked') score += 12;
  if (htfVs === 'conflict') score -= 14;
  const ph = structurePick?.highlight?.phase;
  if (ph === 'confirmed') score += 10;
  if (ph === 'failed') score -= 18;
  if (ph === 'breakout' || ph === 'settling') score += 3;
  if (scenario?.lastVerdict === '안착') score += 6;
  if (scenario?.lastVerdict === '실패') score -= 8;

  const cs = analysis?.confirmedSignal;
  const gates = cs?.gatesPassCount;
  if (cs?.confirmed && cs.direction) {
    const dirKo = cs.direction === 'LONG' ? '롱' : '숏';
    extra.push(`5요소 확정: ${dirKo} (게이트 5/5·MTF 통과, 참고).`);
    score += 8;
  } else if (typeof gates === 'number' && gates >= 4) {
    const dirKo =
      analysis?.verdict === 'LONG' ? '롱' : analysis?.verdict === 'SHORT' ? '숏' : '방향';
    extra.push(`확정 후보: 게이트 ${gates}/5 (${dirKo} 쪽, 마감·편향 정합 전).`);
    score += 4;
  } else if (typeof gates === 'number' && gates > 0) {
    extra.push(`확정 게이트: ${gates}/5 — 구조·RSI·S/R·종가·FVG 단계별 확인.`);
  }
  if (cs?.readinessTier === 'mtf_veto' || cs?.mtfBlocked) {
    extra.push('MTF 반대: 5/5여도 확정 보류 — 상위 TF·체결 별도 확인.');
    score -= 10;
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  const referenceStrengthLineKo = `참고 강도(휴리스틱·0~100): ${score} — 확정 신호·승률 아님.`;

  return {
    extraBullets: extra,
    referenceStrength0to100: score,
    referenceStrengthLineKo: referenceStrengthLineKo,
  };
}
