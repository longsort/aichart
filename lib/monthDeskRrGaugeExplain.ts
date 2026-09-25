/**
 * 마감·안착 — 손익비(R:R) 게이지 계산·설명.
 * 비정상적으로 큰 RR(무효선이 현재가에 너무 가까움)은 왜곡 방지.
 */
import type { MonthDeskBoardMetrics } from '@/lib/monthDeskBoardMetrics';
import type { MonthDeskCoreLevels } from '@/lib/monthDeskCoreLevels';

export type MonthDeskRrGaugeResult = {
  rr: number | null;
  rrDisplay: string;
  rrPass: boolean;
  rrDistorted: boolean;
  rrCaptionKo: string;
  rrExplainKo: string;
  confirmStatusKo: string;
  confirmIsFinal: boolean;
};

const RR_PASS_MIN = 1.6;
const RR_DISPLAY_CAP = 15;

function minRiskFloor(close: number, entryMid: number | null, invalidation: number, atr?: number | null): number {
  const entry = entryMid ?? close;
  const structural = Math.abs(entry - invalidation);
  const pctFloor = close * 0.0025;
  const atrFloor = atr != null && atr > 0 ? atr * 0.35 : 0;
  return Math.max(structural, pctFloor, atrFloor, close * 0.0008);
}

export function computeMonthDeskRrGauge(input: {
  metrics: MonthDeskBoardMetrics;
  levels: MonthDeskCoreLevels;
  atr?: number | null;
}): MonthDeskRrGaugeResult {
  const { metrics: m, levels, atr } = input;
  const close = levels.close;
  const targetRef =
    levels.targets[0] ??
    (m.verdict === 'LONG' ? levels.resistance : m.verdict === 'SHORT' ? levels.support : null);
  const invalidationRef = levels.invalidation ?? null;
  const entryMid = levels.entryMid ?? close ?? null;

  let rr: number | null = null;
  let rrDistorted = false;

  if (close != null && targetRef != null && invalidationRef != null && m.verdict !== 'WAIT') {
    const riskFloor = minRiskFloor(close, entryMid, invalidationRef, atr);
    const structuralRisk =
      m.verdict === 'LONG'
        ? Math.max(0, (entryMid ?? close) - invalidationRef)
        : Math.max(0, invalidationRef - (entryMid ?? close));
    if (structuralRisk > 0 && structuralRisk < riskFloor * 0.55) {
      rrDistorted = true;
    }
    const risk = Math.max(structuralRisk, riskFloor);
    if (m.verdict === 'LONG') {
      const reward = targetRef - (entryMid ?? close);
      if (reward > 0 && risk > 0) rr = reward / risk;
    } else if (m.verdict === 'SHORT') {
      const reward = (entryMid ?? close) - targetRef;
      if (reward > 0 && risk > 0) rr = reward / risk;
    }
  }

  const rrPass = rr != null && !rrDistorted && rr >= RR_PASS_MIN;
  const rrCapped = rr != null && rr > RR_DISPLAY_CAP;
  const rrDisplay = rr == null ? '–' : rrCapped ? `${RR_DISPLAY_CAP}+` : rr.toFixed(2);

  const gates = m.gatesPassCount ?? 0;
  const confirmIsFinal = !!m.confirmed && gates >= 5 && !m.mtfBlocked;
  let confirmStatusKo = '관망 · 확정 아님';
  if (confirmIsFinal) {
    confirmStatusKo = `${m.verdict === 'LONG' ? '롱' : '숏'} · 5/5 확정(참고)`;
  } else if (gates >= 4) {
    confirmStatusKo = `${m.verdict === 'LONG' ? '롱' : m.verdict === 'SHORT' ? '숏' : '관망'} · 확정 근접 ${gates}/5`;
  } else if (gates >= 3) {
    confirmStatusKo = `${m.verdict === 'LONG' ? '롱' : m.verdict === 'SHORT' ? '숏' : '관망'} · 확정 후보 ${gates}/5 (아직 아님)`;
  } else if (m.verdict !== 'WAIT') {
    confirmStatusKo = `${m.verdict === 'LONG' ? '롱' : '숏'} 우세 · 게이트 ${gates}/5 · 확정 아님`;
  }

  let rrCaptionKo = 'TP1 대비 무효선까지 손익비';
  if (rr == null) {
    rrCaptionKo = 'TP·무효선 없음 — R:R 계산 불가';
  } else if (rrDistorted || rrCapped) {
    rrCaptionKo = '무효선이 너무 가까움 — 숫자 과대, 참고만';
  } else if (rrPass) {
    rrCaptionKo = `1 : ${rr.toFixed(1)} · 조건상 유리(확정 아님)`;
  } else {
    rrCaptionKo = `1 : ${rr.toFixed(1)} · 1.6 미만 · 보수적`;
  }

  const rrExplainKo = [
    '【손익비 R:R】 첫 목표(TP1)까지 이익 ÷ 진입~무효(손절) 리스크.',
    '· 1.6 이상이면 게이지가 녹색(유리한 편) — 그래도 확정 매매 아님.',
    rrDistorted || rrCapped
      ? `· ${rrDisplay}처럼 수백이면 무효선이 현재가에 붙어 있어 왜곡된 값입니다. 좋다는 뜻 아님.`
      : '',
    `· 【확정 여부】 게이트 ${gates}/5 — 5/5 + MTF 정합 전까지는 "확정 후보"일 뿐, 롱 확정 아님.`,
    m.mtfBlocked ? '· 상위 TF와 엇갈리면(MTF 차단) 방향 신뢰도 하락.' : '',
    '· 참고·교육용 — 무효 이탈 시 시나리오 재검토.',
  ]
    .filter(Boolean)
    .join('\n');

  return {
    rr,
    rrDisplay,
    rrPass,
    rrDistorted: rrDistorted || rrCapped,
    rrCaptionKo,
    rrExplainKo,
    confirmStatusKo,
    confirmIsFinal,
  };
}

export function monthDeskRrGaugeArcValue(rr: number | null, distorted: boolean): number {
  if (rr == null || distorted) return 0;
  return Math.min(100, (rr / RR_PASS_MIN) * 100);
}
