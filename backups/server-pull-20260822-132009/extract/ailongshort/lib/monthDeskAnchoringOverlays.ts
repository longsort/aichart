/**
 * 마감·안착(MONTH_START_DESK): 인포그래프 기준 **종가 참조선** + 시나리오 **무효화 레벨** 점선.
 * `computeClosingEnvelopeFuturesScenario`와 동일 마지막 봉·무효 가격을 사용 — 교육·참고용.
 */
import type { Candle, OverlayItem } from '@/types';
import { closingEnvelopeVerdictStripLabel, type ClosingEnvelopeFuturesScenario } from '@/lib/institutionalSuperBand';

function fmtPx(n: number): string {
  const a = Math.abs(n);
  const frac = a >= 1000 ? 2 : a >= 1 ? 4 : 6;
  return n.toLocaleString(undefined, { maximumFractionDigits: frac });
}

/** 마지막 봉이 아직 해당 구간에서 형성 중인지(종가 미확정) */
function lastCandleForming(arr: Candle[]): boolean {
  if (!arr || arr.length < 2) return false;
  const last = arr[arr.length - 1]!;
  const prev = arr[arr.length - 2]!;
  const nowSec = Math.floor(Date.now() / 1000);
  const barSec = Math.max(60, Number(last.time) - Number(prev.time));
  return nowSec < Number(last.time) + barSec;
}

/** 직전 확정 봉 종가(closeLevelEngine과 동일 규칙) */
function priorConfirmedClose(arr: Candle[]): number | null {
  if (!arr || arr.length === 0) return null;
  if (arr.length === 1) return Number(arr[0].close);
  const last = arr[arr.length - 1];
  const prev = arr[arr.length - 2];
  const nowSec = Math.floor(Date.now() / 1000);
  const barSec = Math.max(60, Number(last.time) - Number(prev.time));
  const lastIsClosed = nowSec >= Number(last.time) + barSec;
  const c = lastIsClosed ? last.close : prev.close;
  const v = Number(c);
  return Number.isFinite(v) ? v : null;
}

export function buildMonthDeskAnchoringOverlays(params: {
  candles: Candle[];
  scenario: ClosingEnvelopeFuturesScenario | null;
}): OverlayItem[] {
  const { candles, scenario } = params;
  if (!scenario || candles.length < 1) return [];

  const last = candles[candles.length - 1];
  const lookback = Math.min(240, Math.max(80, candles.length));
  const first = candles[Math.max(0, candles.length - lookback)];
  const t1 = Number(first.time);
  const t2 = Number(last.time);
  const closePx = Number(last.close);
  const inv = Number(scenario.invalidationPrice);
  if (!Number.isFinite(t1) || !Number.isFinite(t2) || !Number.isFinite(closePx) || !Number.isFinite(inv)) return [];

  const sideHint =
    scenario.invalidationSide === 'below'
      ? '이 가격 아래로 종가 마감 시 롱 전제 약화(참고)'
      : '이 가격 위로 종가 마감 시 숏 전제 약화(참고)';

  const forming = lastCandleForming(candles);
  const verdictKo = closingEnvelopeVerdictStripLabel(scenario.lastVerdict);
  const biasKo =
    scenario.bias === 'LONG' ? '롱 편향' : scenario.bias === 'SHORT' ? '숏 편향' : '중립·분기';
  const invSideKo = scenario.invalidationSide === 'below' ? '이하' : '이상';
  const closeTooltip = [
    `종가선 · ${verdictKo}${forming ? ' (현재 봉 형성 중)' : ''}`,
    scenario.summaryKo,
    `무효화 참고가: ${fmtPx(inv)} 종가 ${invSideKo} — 시나리오 ${biasKo}`,
    bulletsKoLine(scenario),
    '참고용 · 수익·승률 보장 아님',
  ]
    .filter(Boolean)
    .join('\n');

  const closeLine: OverlayItem = {
    id: 'month-desk-anchor-close-line',
    kind: 'keyLevel',
    label: `종가선 · ${verdictKo}`,
    x1: 0,
    y1: 0,
    x2: 1,
    y2: 0,
    time1: t1,
    time2: t2,
    price1: closePx,
    price2: closePx,
    confidence: 86,
    color: 'rgba(56,189,248,0.92)',
    lineLabelColor: '#38BDF8',
    category: 'keyLevel',
    labelTooltip: closeTooltip,
  };

  const invLine: OverlayItem = {
    id: 'month-desk-anchor-invalidation',
    kind: 'keyLevel',
    label: '무효화 · 파기(참고)',
    x1: 0,
    y1: 0,
    x2: 1,
    y2: 0,
    time1: t1,
    time2: t2,
    price1: inv,
    price2: inv,
    confidence: 90,
    color: 'rgba(248,113,113,0.88)',
    lineLabelColor: '#F87171',
    lineDash: '10 6',
    category: 'keyLevel',
    labelTooltip: [
      `무효화 ${fmtPx(inv)}`,
      sideHint,
      scenario.summaryKo,
      `편향: ${biasKo}`,
      '참고용',
    ].join('\n'),
  };

  const out: OverlayItem[] = [closeLine, invLine];

  const prior = priorConfirmedClose(candles);
  if (
    prior != null &&
    Number.isFinite(prior) &&
    Math.abs(prior - closePx) / Math.max(Math.abs(closePx), 1e-12) > 1.5e-5
  ) {
    out.push({
      id: 'month-desk-anchor-prior-close',
      kind: 'keyLevel',
      label: '직전봉 마감확정 · 참고',
      x1: 0,
      y1: 0,
      x2: 1,
      y2: 0,
      time1: t1,
      time2: t2,
      price1: prior,
      price2: prior,
      confidence: 72,
      color: 'rgba(148,163,184,0.75)',
      lineLabelColor: '#94A3B8',
      lineDash: '4 6',
      category: 'keyLevel',
      labelTooltip: priorCloseTooltip(prior, forming, closePx),
    });
  }

  return out;
}

function bulletsKoLine(scenario: ClosingEnvelopeFuturesScenario): string {
  const b = scenario.bulletsKo?.filter(Boolean) ?? [];
  if (b.length === 0) return '';
  return b.slice(0, 3).join(' · ');
}

function priorCloseTooltip(prior: number, forming: boolean, refClose: number): string {
  const lines = [
    `직전 확정 봉 종가 ${fmtPx(prior)}`,
    forming
      ? '현재 봉은 형성 중 — 이 선은 직전 마감 확정 종가(참고 종가선과 비교)'
      : '마지막 봉이 확정 마감이면 참고 종가선과 가깝거나 동일할 수 있음',
    Math.abs(prior - refClose) / Math.max(Math.abs(refClose), 1e-12) > 1e-5
      ? `참고 종가선 대비 Δ ${prior > refClose ? '+' : ''}${fmtPx(prior - refClose)}`
      : null,
    '참고용',
  ].filter(Boolean) as string[];
  return lines.join('\n');
}
