/**
 * 독수리 HUD — 엔진 필드를 한 줄 AI 종합(롱/숏·타점·손절·목표·TF별)으로 묶음.
 * 확정 수익·고정 승률 표현 금지.
 */
import type { AnalyzeResponse } from '@/types';
import type { Eagle1MainPlan } from './signalEngine';
import type { Eagle1HudPack } from './hudPack';
import { eagle1DecisionKo, formatPriceCompact, EAGLE1_TERM_KO } from './chartUx';
import { formatSamplePct } from './noFakeNumbers';

export type Eagle1HorizonBias = {
  label: string;
  biasKo: string;
  note: string;
};

export type Eagle1HudSynthesis = {
  verdict: 'LONG' | 'SHORT' | 'WAIT';
  verdictKo: string;
  entryText: string;
  stopText: string;
  targetText: string;
  rrText: string;
  aiLine: string;
  horizons: {
    scalp: Eagle1HorizonBias;
    mid: Eagle1HorizonBias;
    swing: Eagle1HorizonBias;
  };
};

function asPlan(raw: unknown): Eagle1MainPlan | null {
  if (!raw || typeof raw !== 'object') return null;
  return raw as Eagle1MainPlan;
}

function horizonFromCompass(
  hud: Eagle1HudPack | null,
  tfs: string[],
  label: string
): Eagle1HorizonBias {
  const rows = (hud?.mtfCompass ?? []).filter((r) => tfs.includes(r.tf));
  if (!rows.length) {
    return { label, biasKo: '대기', note: 'MTF 데이터 없음' };
  }
  const up = rows.filter((r) => r.bias === 'up').length;
  const dn = rows.filter((r) => r.bias === 'down').length;
  if (up === dn) return { label, biasKo: '혼조', note: rows.map((r) => `${r.tf}${r.arrow}`).join(' ') };
  const bullish = up > dn;
  return {
    label,
    biasKo: bullish ? '상방 우세' : '하방 우세',
    note: rows.map((r) => `${r.tf}${r.arrow}`).join(' · '),
  };
}

export function buildEagle1HudSynthesis(analysis: AnalyzeResponse | null): Eagle1HudSynthesis | null {
  if (!analysis) return null;
  const plan = asPlan(analysis.eagle1MainPlan);
  const hud = (analysis.eagle1Hud ?? null) as Eagle1HudPack | null;

  let verdict: 'LONG' | 'SHORT' | 'WAIT' = 'WAIT';
  if (plan?.direction === 'LONG' || plan?.status === 'CONFIRMED_LONG' || plan?.status === 'LONG_WATCH') {
    verdict = 'LONG';
  } else if (plan?.direction === 'SHORT' || plan?.status === 'CONFIRMED_SHORT' || plan?.status === 'SHORT_WATCH') {
    verdict = 'SHORT';
  } else if (analysis.verdict === 'LONG' || analysis.verdict === 'SHORT') {
    verdict = analysis.verdict;
  }

  const entryText =
    plan?.entryLow != null
      ? `${formatPriceCompact(plan.entryLow)} ~ ${formatPriceCompact(plan.entryHigh)}`
      : '—';
  const stopText = formatPriceCompact(plan?.sl ?? null);
  const targetText =
    [plan?.tp1, plan?.tp2, plan?.tp3]
      .filter((p) => p != null)
      .map((p) => formatPriceCompact(p))
      .join(' / ') || '—';
  const rrText = plan?.netRr != null ? `1:${plan.netRr.toFixed(2)}` : '통계 부족';

  const cal = hud?.scoreCalibration?.calibratedText ?? formatSamplePct(plan?.sampleSize ?? 0, plan?.calibratedProbability ?? null);
  const stateKo = hud?.marketState?.labelKo ?? plan?.status ?? '대기';
  const flowKo = hud?.flowSync?.labelKo ?? '—';
  const aiLine = [
    verdict === 'WAIT' ? '방향 대기' : verdict === 'LONG' ? '롱 우선' : '숏 우선',
    stateKo,
    flowKo !== '—' ? flowKo : null,
    cal !== '데이터 없음' ? cal : null,
    '확정 수익 아님',
  ]
    .filter(Boolean)
    .join(' · ');

  return {
    verdict,
    verdictKo: plan ? eagle1DecisionKo(plan.status) : verdict === 'LONG' ? '롱' : verdict === 'SHORT' ? '숏' : '대기',
    entryText,
    stopText,
    targetText,
    rrText,
    aiLine,
    horizons: {
      scalp: horizonFromCompass(hud, ['1m', '5m', '15m'], '단타'),
      mid: horizonFromCompass(hud, ['1H', '4H', '1D'], '중투'),
      swing: horizonFromCompass(hud, ['1W', '1M'], '스윙'),
    },
  };
}

export function formatEagle1EventKo(ev: {
  kind?: string;
  icon?: string;
  chartIcon?: string;
  labelKo?: string;
  labelEn?: string;
  bias?: string;
}): string {
  const kind = String(ev.kind || '').toUpperCase();
  const bias = String(ev.bias || '');
  if (kind === 'BOS') {
    const arrow = bias === 'bullish' ? '↑' : bias === 'bearish' ? '↓' : '';
    return `${EAGLE1_TERM_KO.BOS}${arrow}`;
  }
  if (kind === 'CHOCH') {
    const arrow = bias === 'bullish' ? '↑' : bias === 'bearish' ? '↓' : '';
    return `${EAGLE1_TERM_KO.CHOCH}${arrow}`;
  }
  if (kind === 'SWEEP') return EAGLE1_TERM_KO.SWEEP;
  const raw = String(ev.chartIcon || ev.icon || ev.labelEn || ev.labelKo || kind || '·');
  for (const [k, v] of Object.entries(EAGLE1_TERM_KO)) {
    if (raw.toUpperCase().includes(k)) return v;
  }
  return raw.length > 12 ? raw.slice(0, 11) + '…' : raw;
}

export function eagle1EventExplainKo(kind: string): string {
  const k = kind.toUpperCase();
  if (k === 'BOS') return 'BOS(구조돌파): 이전 고점·저점 구조가 깨졌을 때 — 추세 지속 쪽 신호';
  if (k === 'CHOCH') return 'CHoCH(추세전환): 기존 추세와 반대 구조가 나올 때 — 전환 후보(확정 아님)';
  if (k === 'SWEEP') return '유동성 털기: 위·아래 매물대를 잠깐 뚫었다 되돌림';
  return '캔들 구조 이벤트 · 확정 수익 아님';
}

export function resolveHudOrderFlowSummary(analysis: AnalyzeResponse | null, hud: Eagle1HudPack | null): string {
  if (hud?.orderFlow?.hasAnyLive && hud.orderFlow.summaryKo && !hud.orderFlow.summaryKo.startsWith('데이터 없음')) {
    return hud.orderFlow.summaryKo;
  }
  const parts: string[] = [];
  if (typeof analysis?.volumeDelta === 'number') {
    parts.push(analysis.volumeDelta > 0 ? '체결 매수 우위' : analysis.volumeDelta < 0 ? '체결 매도 우위' : '체결 중립');
  } else if (typeof analysis?.buyPressure === 'number') {
    parts.push(`매수비중 ${Math.round(analysis.buyPressure * 100)}%`);
  }
  if (analysis?.oiState) {
    parts.push(
      analysis.oiState === 'increasing' ? 'OI↑' : analysis.oiState === 'decreasing' ? 'OI↓' : 'OI→'
    );
  }
  if (analysis?.fundingState && analysis.fundingState !== 'neutral') {
    parts.push(analysis.fundingState === 'positive' ? '펀딩+' : '펀딩−');
  }
  if (typeof analysis?.orderbookImbalance === 'number') {
    parts.push(analysis.orderbookImbalance > 0.05 ? '호가 매수' : analysis.orderbookImbalance < -0.05 ? '호가 매도' : '호가 균형');
  }
  if (parts.length) return parts.join(' · ');
  const vf = hud?.volumeFlow;
  if (vf?.labelKo) return `거래량흐름 · ${vf.labelKo}${vf.value != null ? ` (${vf.value >= 0 ? '+' : ''}${Number(vf.value).toFixed(2)})` : ''}`;
  if (analysis?.verdict === 'LONG') return 'CVD 라이브 대기 · 구조 롱 근사';
  if (analysis?.verdict === 'SHORT') return 'CVD 라이브 대기 · 구조 숏 근사';
  return '라이브 보강중…';
}

export function resolveHudVolumeFlow(
  hud: Eagle1HudPack | null,
  analysis: AnalyzeResponse | null
): { value: string; labelKo: string } {
  if (hud?.volumeFlow?.value != null) {
    const v = hud.volumeFlow.value;
    return {
      value: `${v >= 0 ? '+' : ''}${v.toFixed(2)}`,
      labelKo: hud.volumeFlow.labelKo,
    };
  }
  if (typeof analysis?.volumeDelta === 'number') {
    return {
      value: `${analysis.volumeDelta >= 0 ? '+' : ''}${analysis.volumeDelta.toFixed(2)}`,
      labelKo: analysis.volumeDelta >= 0 ? '순매수 유입' : '순매도 유입',
    };
  }
  if (typeof analysis?.buyPressure === 'number') {
    return {
      value: `${Math.round(analysis.buyPressure * 100)}%`,
      labelKo: '매수 체결 비중(근사)',
    };
  }
  return { value: '—', labelKo: '라이브 보강중…' };
}

export function resolveHudTotalScore(hud: Eagle1HudPack | null): number | null {
  if (!hud?.squeezeRadar) {
    return hud?.scoreCalibration?.aiScore ?? null;
  }
  const side = hud.squeezeRadar.activeSide;
  if (side === 'SHORT') return hud.squeezeRadar.short.score ?? hud.squeezeRadar.long.score ?? null;
  if (side === 'LONG') return hud.squeezeRadar.long.score ?? hud.squeezeRadar.short.score ?? null;
  return (
    hud.squeezeRadar.long.score ??
    hud.squeezeRadar.short.score ??
    hud.scoreCalibration?.aiScore ??
    null
  );
}

export type HudSqueezeLaneUi = {
  score: number | null;
  labelKo: string;
  labelEn: string;
  state: string;
};

export function resolveHudSqueezeLane(
  hud: Eagle1HudPack | null,
  analysis: AnalyzeResponse | null,
  side: 'long' | 'short'
): HudSqueezeLaneUi {
  const lane = side === 'long' ? hud?.squeezeRadar?.long : hud?.squeezeRadar?.short;
  if (lane) {
    return {
      score: lane.score ?? null,
      labelKo: lane.labelKo || (side === 'long' ? '롱 압축' : '숏 압축'),
      labelEn: lane.labelEn || (side === 'long' ? 'LONG' : 'SHORT'),
      state: lane.state || 'NONE',
    };
  }
  const rawScore = side === 'long' ? analysis?.longScore : analysis?.shortScore;
  const compression = hud?.bigMove?.compression ?? null;
  const score =
    typeof rawScore === 'number' && Number.isFinite(rawScore)
      ? rawScore
      : typeof compression === 'number'
        ? compression
        : hud?.scoreCalibration?.aiScore ?? null;
  const verdict = analysis?.verdict;
  const biasUp = side === 'long' ? verdict === 'LONG' : verdict === 'SHORT';
  return {
    score,
    labelKo:
      typeof rawScore === 'number'
        ? side === 'long'
          ? rawScore >= 55
            ? '상방 우세(근사)'
            : '상방 약(근사)'
          : rawScore >= 55
            ? '하방 우세(근사)'
            : '하방 약(근사)'
        : hud?.bigMove?.labelKo ?? '엔진 근사',
    labelEn: side === 'long' ? 'LONG' : 'SHORT',
    state: biasUp ? 'WATCH' : 'NONE',
  };
}

export function resolveHudPathProbabilityText(
  hud: Eagle1HudPack | null,
  analysis: AnalyzeResponse | null,
  hubHint?: { verdictKo?: string; longPct?: number; shortPct?: number; sampleHintKo?: string } | null
): { text: string; sample: number; note: string } {
  if (hud?.pathProbability?.text && !/^데이터 없음/.test(hud.pathProbability.text) && !/PATH UNAVAILABLE|통계 부족/i.test(hud.pathProbability.text)) {
    return {
      text: hud.pathProbability.text,
      sample: hud.pathProbability.sample ?? 0,
      note: hud.smartFuturePath?.summaryKo ?? '표본 기반 · 임의 점선 금지',
    };
  }
  const plan = asPlan(analysis?.eagle1MainPlan);
  const hist = analysis?.eagle1HistoricalOutcome ?? null;
  const sample = plan?.sampleSize ?? hist?.totalSample ?? 0;
  const cal = formatSamplePct(sample, plan?.calibratedProbability ?? null);
  const paths = hud?.paths ?? [];
  const top = paths[0];
  if (hubHint?.verdictKo) {
    return {
      text: `变身 ${hubHint.verdictKo} · 롱${hubHint.longPct ?? '—'}%/숏${hubHint.shortPct ?? '—'}%`,
      sample,
      note: hubHint.sampleHintKo || '과거 경로 표본 부족 · AI超级变身统计 시나리오',
    };
  }
  return {
    text: top?.text ?? cal,
    sample,
    note: top ? `${top.labelEn} n=${top.sample}` : '경로 통계 부족 · 조건부',
  };
}

export function resolveHudProfileLevelsSummary(
  hud: Eagle1HudPack | null,
  analysis: AnalyzeResponse | null
): { summary: string; rows: Array<{ kind: string; labelKo: string; price: number }> } | null {
  if (hud?.profileLevels?.rows?.length) {
    return {
      summary: hud.profileLevels.summaryKo,
      rows: hud.profileLevels.rows.slice(0, 6).map((r) => ({
        kind: r.kind,
        labelKo: r.labelKo,
        price: r.price,
      })),
    };
  }
  const zones = analysis?.eagle1UnifiedZones as
    | {
        resist?: Array<{ mid?: number; upper?: number; lower?: number }>;
        support?: Array<{ mid?: number; upper?: number; lower?: number }>;
      }
    | null
    | undefined;
  const rows: Array<{ kind: string; labelKo: string; price: number }> = [];
  for (const z of zones?.resist ?? []) {
    const price = z.mid ?? z.upper ?? z.lower;
    if (price != null) rows.push({ kind: 'resist', labelKo: '저항', price });
  }
  for (const z of zones?.support ?? []) {
    const price = z.mid ?? z.lower ?? z.upper;
    if (price != null) rows.push({ kind: 'support', labelKo: '지지', price });
  }
  const plan = asPlan(analysis?.eagle1MainPlan);
  if (plan?.sl != null) rows.push({ kind: 'sl', labelKo: '손절', price: plan.sl });
  if (plan?.tp1 != null) rows.push({ kind: 'tp1', labelKo: '목표1', price: plan.tp1 });
  const zonesPack = analysis?.eagle1Zones as
    | { profile?: { poc?: number | null; vah?: number | null; val?: number | null; pocState?: string | null } }
    | null
    | undefined;
  const prof = zonesPack?.profile;
  if (prof?.poc != null && !rows.some((r) => r.kind === 'poc')) {
    rows.push({ kind: 'poc', labelKo: 'POC', price: prof.poc });
  }
  if (prof?.vah != null) rows.push({ kind: 'vah', labelKo: 'VAH', price: prof.vah });
  if (prof?.val != null) rows.push({ kind: 'val', labelKo: 'VAL', price: prof.val });
  const st = analysis?.eagle1Structure as { rangeHigh?: number | null; rangeLow?: number | null } | null | undefined;
  if (st?.rangeHigh != null) rows.push({ kind: 'rangeHi', labelKo: '범위상단', price: st.rangeHigh });
  if (st?.rangeLow != null) rows.push({ kind: 'rangeLo', labelKo: '범위하단', price: st.rangeLow });
  if (!rows.length) return null;
  return { summary: prof?.poc != null ? '프로파일·플랜 레벨' : '통합존·플랜 근사 레벨', rows: rows.slice(0, 8) };
}

export function resolveHudFundingLabel(analysis: AnalyzeResponse | null): string {
  if (analysis?.fundingState === 'positive') return '펀딩+ (롱 과열)';
  if (analysis?.fundingState === 'negative') return '펀딩− (숏 과열)';
  if (analysis?.fundingState === 'neutral') return '펀딩 중립';
  if (analysis?.eagle1Availability?.has_funding) return '시리즈';
  return '라이브 보강중…';
}
