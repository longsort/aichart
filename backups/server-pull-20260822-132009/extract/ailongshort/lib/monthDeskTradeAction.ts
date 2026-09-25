import type { AnalyzeResponse } from '@/types';
import type { MonthDeskCoreLevels } from '@/lib/monthDeskCoreLevels';
import type { MonthDeskWhaleSnapshot } from '@/lib/monthDeskWhaleDesk';
import type { MonthDeskBoardMetrics } from '@/lib/monthDeskBoardMetrics';

export type TradeLevelRow = {
  key: string;
  label: string;
  price: number | null;
  /** 현재가 대비 % (+ = 위에 있음) */
  distPct: number | null;
  distKo: string;
  role: 'entry' | 'invalid' | 'support' | 'resistance' | 'tp' | 'rr';
};

export type MonthDeskTradeAction = {
  status: 'at_entry' | 'near_entry' | 'wait_pullback' | 'wait_breakout' | 'invalid_hit' | 'no_levels' | 'neutral';
  statusKo: string;
  actionKo: string;
  confirmKo: string;
  invalidKo: string;
  rows: TradeLevelRow[];
  rrLabel: string | null;
  whaleAligned: boolean | null;
  whaleLine: string;
  gateLine: string | null;
  entryPlanKo: string;
  stopPlanKo: string;
  reboundPlanKo: string;
  riskPlanKo: string;
};

function pctDist(close: number, target: number): number {
  return ((target - close) / close) * 100;
}

function fmtPct(n: number): string {
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toFixed(2)}%`;
}

function fmtPx(n: number): string {
  return n >= 1000 ? n.toLocaleString(undefined, { maximumFractionDigits: 2 }) : n.toFixed(2);
}

function fmtRange(lo: number | null, hi: number | null): string {
  if (lo == null && hi == null) return '—';
  if (lo == null || hi == null) return fmtPx((lo ?? hi) as number);
  const a = Math.min(lo, hi);
  const b = Math.max(lo, hi);
  return `${fmtPx(a)} ~ ${fmtPx(b)}`;
}

function row(
  key: string,
  label: string,
  price: number | null,
  close: number | null,
  role: TradeLevelRow['role']
): TradeLevelRow {
  if (price == null || close == null || close <= 0) {
    return { key, label, price, distPct: null, distKo: '—', role };
  }
  const d = pctDist(close, price);
  return {
    key,
    label,
    price,
    distPct: d,
    distKo: fmtPct(d),
    role,
  };
}

function whaleAligned(verdict: 'LONG' | 'SHORT' | 'WAIT', whale: MonthDeskWhaleSnapshot | null): boolean | null {
  if (!whale || verdict === 'WAIT') return null;
  const bull =
    whale.phase === 'buy_incoming' ||
    whale.phase === 'buy_done' ||
    whale.phase === 'defend_long' ||
    whale.confluentLong ||
    (whale.buyPressure >= 58 && whale.lastBarBuy);
  const bear =
    whale.phase === 'sell_incoming' ||
    whale.phase === 'sell_done' ||
    whale.phase === 'sell_zone' ||
    whale.phase === 'defend_short' ||
    whale.confluentShort ||
    (whale.sellPressure >= 58 && whale.lastBarSell);
  if (verdict === 'LONG') return bull && !bear;
  if (verdict === 'SHORT') return bear && !bull;
  return null;
}

function whaleLine(verdict: 'LONG' | 'SHORT' | 'WAIT', whale: MonthDeskWhaleSnapshot | null, aligned: boolean | null): string {
  if (!whale) return '고래·WAD 데이터 없음';
  const base = `최근 WAD 매수 ${whale.whaleBuyRecent} · 매도 ${whale.whaleSellRecent}`;
  if (verdict === 'WAIT') return `${base} — 방향 대기 중`;
  if (aligned === true) return `${base} — ${verdict === 'LONG' ? '롱' : '숏'} 시나리오와 같은 쪽`;
  if (aligned === false) return `${base} — ⚠ ${verdict === 'LONG' ? '롱' : '숏'} 판정과 반대 (관망·확인)`;
  return base;
}

export function buildMonthDeskTradeAction(
  metrics: MonthDeskBoardMetrics,
  levels: MonthDeskCoreLevels,
  whale: MonthDeskWhaleSnapshot | null,
  analysis: AnalyzeResponse | null
): MonthDeskTradeAction {
  const verdict = metrics.verdict;
  const close = levels.close;
  const entryLo = levels.entryLow;
  const entryHi = levels.entryHigh;
  const inv = levels.invalidation;
  const tp1 = levels.targets[0] ?? null;
  const tp2 = levels.targets[1] ?? null;
  const tp3 = levels.targets[2] ?? null;
  const ai = analysis?.aiUnifiedLongShort;

  const aligned = whaleAligned(verdict, whale);

  const rows: TradeLevelRow[] = [
    row('entry', '★ 타점(상단)', entryHi, close, 'entry'),
    row('entry-mid', '★ 타점(중심)', levels.entryMid, close, 'entry'),
    row('entry-lo', '★ 타점(하단)', entryLo, close, 'entry'),
    row('inv', '⛔ 손절·무효', inv, close, 'invalid'),
    row('sup', '지지', levels.support, close, 'support'),
    row('res', '저항', levels.resistance, close, 'resistance'),
    row('tp1', '익절 TP1', tp1, close, 'tp'),
    row('tp2', '익절 TP2', tp2, close, 'tp'),
    row('tp3', '익절 TP3', tp3, close, 'tp'),
  ];

  let rrLabel: string | null = null;
  if (close != null && entryLo != null && inv != null && tp1 != null && verdict === 'LONG') {
    const risk = Math.abs(close - inv);
    const reward = Math.abs(tp1 - close);
    if (risk > 0) rrLabel = `손익비(현재→TP1 / 현재→무효) ≈ 1 : ${(reward / risk).toFixed(1)}`;
  } else if (close != null && entryHi != null && inv != null && tp1 != null && verdict === 'SHORT') {
    const risk = Math.abs(inv - close);
    const reward = Math.abs(close - tp1);
    if (risk > 0) rrLabel = `손익비(현재→TP1 / 현재→무효) ≈ 1 : ${(reward / risk).toFixed(1)}`;
  }

  if (close == null) {
    return {
      status: 'no_levels',
      statusKo: '가격 없음',
      actionKo: '캔들·분석 로드 후 실전 행동 라인이 표시됩니다.',
      confirmKo: '—',
      invalidKo: '—',
      entryPlanKo: '—',
      stopPlanKo: '—',
      reboundPlanKo: '—',
      riskPlanKo: '—',
      rows,
      rrLabel,
      whaleAligned: aligned,
      whaleLine: whaleLine(verdict, whale, aligned),
      gateLine: metrics.gatesPassCount > 0 ? `구조 확정 ${metrics.gatesPassCount}/5` : null,
    };
  }

  let status: MonthDeskTradeAction['status'] = 'neutral';
  let statusKo = '관망';
  let actionKo = '방향·타점·무효가 정리되면 행동 기준이 표시됩니다.';
  let confirmKo = '—';
  let invalidKo = '—';
  let entryPlanKo = `진입 구간: ${fmtRange(entryLo, entryHi)} (중심 ${levels.entryMid != null ? fmtPx(levels.entryMid) : '—'})`;
  let stopPlanKo = inv != null ? `손절/무효: ${fmtPx(inv)} 기준` : '손절/무효: 지지·저항 이탈 기준';
  let reboundPlanKo = `반등/목표: ${tp1 != null ? fmtPx(tp1) : 'TP1 미정'}${tp2 != null ? ` → ${fmtPx(tp2)}` : ''}${tp3 != null ? ` → ${fmtPx(tp3)}` : ''}`;
  let riskPlanKo = '리스크: 확정·고래·MTF 불일치 시 추격 금지, 분할 진입 우선';

  const inEntry =
    entryLo != null && entryHi != null && close >= Math.min(entryLo, entryHi) && close <= Math.max(entryLo, entryHi);
  const aboveEntry = entryHi != null && close > entryHi;
  const belowEntry = entryLo != null && close < entryLo;
  const longInvalid = inv != null && close < inv;
  const shortInvalid = inv != null && close > inv;

  const settle = analysis?.settlementZone;
  const settleLine =
    settle && settle.state !== 'none'
      ? `안착 ${settle.state} ${settle.grade} · ${settle.level != null ? fmtPx(settle.level) : '–'}`
      : null;

  if (verdict === 'LONG') {
    invalidKo = inv != null ? `무효: ${fmtPx(inv)} 이하 종가 이탈 시 롱 시나리오 중단` : '무효가 없으면 지지 이탈을 무효로 봄';
    confirmKo =
      settle?.state === 'confirmed' && settle.level != null
        ? `안착 확정 지지 ${fmtPx(settle.level)} · 등급 ${settle.grade}`
        : levels.support != null
          ? `확인: 지지 ${fmtPx(levels.support)} 유지 + 매수 WAD·존 겹침`
          : '확인: 타점 구간에서 지지 유지';

    if (settle?.state === 'failed') {
      status = 'invalid_hit';
      statusKo = '안착 실패';
      actionKo = '안착 시나리오 실패 — 롱 보류·무효선만 감시';
    } else if (longInvalid) {
      status = 'invalid_hit';
      statusKo = '무효 이탈';
      actionKo = '롱 시나리오 중단 — 재분석 전 추가 진입 자제';
    } else if (inEntry) {
      status = 'at_entry';
      statusKo = settle?.state === 'confirmed' ? '안착 확정 · 타점 안' : '타점 구간 안';
      actionKo = aligned === false
        ? '타점 안이나 고래 흐름 반대 — 지지·무효만 보고 분할·소량만 참고'
        : settleLine
          ? `${settleLine} — 타점 안, 무효 이탈 전까지 유지`
          : '타점 구간 — 지지·무효 유지 확인 후 계획대로 (확정·고래 같은 쪽이면 가점)';
    } else if (aboveEntry) {
      status = 'wait_pullback';
      statusKo = '타점 위 (되돌림 대기)';
      const d = entryHi != null ? pctDist(close, entryHi) : 0;
      actionKo = `진입 구간까지 되돌림 ${fmtPct(-d)} — 추격보다 타점 ${entryLo != null && entryHi != null ? `${fmtPx(entryLo)}~${fmtPx(entryHi)}` : ''} 근처`;
    } else if (belowEntry) {
      status = 'wait_breakout';
      statusKo = '타점 아래';
      actionKo = '타점 하단 이탈 — 지지 붕괴 여부 확인, 무효 근접 시 롱 보류';
    } else {
      status = 'near_entry';
      statusKo = '타점 근처';
      actionKo = '타점·지지 근처 — 무효 이탈 전까지 시나리오 유지';
    }
    entryPlanKo = `롱 진입: ${fmtRange(entryLo, entryHi)} 대기 후 체결, 중심 ${levels.entryMid != null ? fmtPx(levels.entryMid) : '—'}`;
    stopPlanKo =
      inv != null
        ? `롱 손절: ${fmtPx(inv)} 종가 이탈 시 종료`
        : levels.support != null
          ? `롱 손절: 지지 ${fmtPx(levels.support)} 하향 이탈 시 종료`
          : '롱 손절: 직전 저점 이탈 시 종료';
    reboundPlanKo =
      tp1 != null
        ? `롱 반등 목표: 1차 ${fmtPx(tp1)}${tp2 != null ? ` / 2차 ${fmtPx(tp2)}` : ''}${tp3 != null ? ` / 3차 ${fmtPx(tp3)}` : ''}`
        : levels.resistance != null
          ? `롱 반등 목표: 저항 ${fmtPx(levels.resistance)} 재테스트`
          : '롱 반등 목표: 상단 저항 재테스트';
    riskPlanKo =
      aligned === false
        ? '리스크: 고래 흐름이 롱과 반대 — 비중 축소 또는 관망'
        : metrics.mtfBlocked
          ? '리스크: MTF 반대 — 확인봉 없이 진입 금지'
          : '리스크: 무효선과 거리 확인, TP1 전 부분청산 고려';
  } else if (verdict === 'SHORT') {
    invalidKo = inv != null ? `무효: ${fmtPx(inv)} 이상 종가 이탈 시 숏 시나리오 중단` : '무효가 없으면 저항 돌파를 무효로 봄';
    confirmKo =
      settle?.state === 'confirmed' && settle.level != null
        ? `안착 확정 저항 ${fmtPx(settle.level)} · 등급 ${settle.grade}`
        : levels.resistance != null
          ? `확인: 저항 ${fmtPx(levels.resistance)} 유지 + 매도 WAD·존 겹침`
          : '확인: 타점 구간에서 저항 유지';

    if (settle?.state === 'failed') {
      status = 'invalid_hit';
      statusKo = '안착 실패';
      actionKo = '안착 시나리오 실패 — 숏 보류·무효선만 감시';
    } else if (shortInvalid) {
      status = 'invalid_hit';
      statusKo = '무효 이탈';
      actionKo = '숏 시나리오 중단 — 재분석 전 추가 진입 자제';
    } else if (inEntry) {
      status = 'at_entry';
      statusKo = settle?.state === 'confirmed' ? '안착 확정 · 타점 안' : '타점 구간 안';
      actionKo = aligned === false
        ? '타점 안이나 고래 흐름 반대 — 저항·무효만 보고 분할·소량만 참고'
        : settleLine
          ? `${settleLine} — 타점 안, 무효 이탈 전까지 유지`
          : '타점 구간 — 저항·무효 유지 확인 후 계획대로';
    } else if (belowEntry) {
      status = 'wait_pullback';
      statusKo = '타점 아래 (반등 대기)';
      const d = entryLo != null ? pctDist(close, entryLo) : 0;
      actionKo = `진입 구간까지 반등 ${fmtPct(d)} — 타점 ${entryLo != null && entryHi != null ? `${fmtPx(entryLo)}~${fmtPx(entryHi)}` : ''} 근처`;
    } else if (aboveEntry) {
      status = 'wait_breakout';
      statusKo = '타점 위';
      actionKo = '타점 상단 돌파 — 저항 돌파 여부 확인, 무효 근접 시 숏 보류';
    } else {
      status = 'near_entry';
      statusKo = '타점 근처';
      actionKo = '타점·저항 근처 — 무효 이탈 전까지 시나리오 유지';
    }
    entryPlanKo = `숏 진입: ${fmtRange(entryLo, entryHi)} 반등 대기 후 체결, 중심 ${levels.entryMid != null ? fmtPx(levels.entryMid) : '—'}`;
    stopPlanKo =
      inv != null
        ? `숏 손절: ${fmtPx(inv)} 종가 상향 이탈 시 종료`
        : levels.resistance != null
          ? `숏 손절: 저항 ${fmtPx(levels.resistance)} 상향 돌파 시 종료`
          : '숏 손절: 직전 고점 돌파 시 종료';
    reboundPlanKo =
      tp1 != null
        ? `숏 하락 목표: 1차 ${fmtPx(tp1)}${tp2 != null ? ` / 2차 ${fmtPx(tp2)}` : ''}${tp3 != null ? ` / 3차 ${fmtPx(tp3)}` : ''}`
        : levels.support != null
          ? `숏 하락 목표: 지지 ${fmtPx(levels.support)} 테스트`
          : '숏 하락 목표: 하단 지지 테스트';
    riskPlanKo =
      aligned === false
        ? '리스크: 고래 흐름이 숏과 반대 — 비중 축소 또는 관망'
        : metrics.mtfBlocked
          ? '리스크: MTF 반대 — 확인봉 없이 진입 금지'
          : '리스크: 무효선과 거리 확인, TP1 전 부분청산 고려';
  } else {
    statusKo = '관망 WAIT';
    actionKo =
      ai?.stage === 'confirmed'
        ? `AI ${ai.stageKorean} — 방향·타점 정리됨, 게이트·MTF 확인 후 진입`
        : '롱/숏 확정·MTF·타점 정리 후 진입 — 지금은 무효·타점 거리만 참고';
    confirmKo = '확정 4/5 이상 + 방향 일치 시에만 시나리오 검토';
    invalidKo = inv != null ? `무효 참고: ${fmtPx(inv)}` : ai?.invalidation ? `무효: ${fmtPx(ai.invalidation.price)}` : '—';
    entryPlanKo = `관망: 진입 구간 ${fmtRange(entryLo, entryHi)} 정렬 대기`;
    stopPlanKo = inv != null ? `무효 기준: ${fmtPx(inv)}` : '무효 기준 정렬 전';
    reboundPlanKo = `목표 참고: ${tp1 != null ? fmtPx(tp1) : '미정'}${tp2 != null ? ` / ${fmtPx(tp2)}` : ''}`;
    riskPlanKo = '리스크: 방향 미정 상태에서 선진입 금지';
  }

  const structGate =
    metrics.structure?.phase === 'confirmed' && metrics.structure.alignedWithVerdict === true
      ? `SMC ${metrics.structure.tag ?? '구조'} 확정`
      : metrics.structure?.phase === 'failed'
        ? 'SMC 구조 실패'
        : null;
  const gateLine =
    metrics.mtfBlocked
      ? 'MTF 반대 — 확정 억제'
      : [
          metrics.gatesPassCount >= 4
            ? `5요소 ${metrics.gatesPassCount}/5`
            : metrics.gatesPassCount > 0
              ? `확정 ${metrics.gatesPassCount}/5`
              : null,
          structGate,
          metrics.entryGrade !== '—' ? `타점 ${metrics.entryGrade}` : null,
        ]
          .filter(Boolean)
          .join(' · ') || null;

  const bf = analysis?.breakoutFollow;
  let finalStatus = status;
  let finalStatusKo = statusKo;
  let finalActionKo = actionKo;
  if (bf && bf.phase !== 'idle') {
    if (bf.phase === 'failed') {
      finalStatus = 'invalid_hit';
      finalStatusKo = '안착·연동 실패';
    } else if (bf.phase === 'confirmed') {
      finalStatusKo =
        bf.bias === 'LONG' ? '돌파·안착 확정' : bf.bias === 'SHORT' ? '하방 안착 확정' : '연동 확정';
      if (finalStatus === 'neutral' || finalStatus === 'wait_breakout') finalStatus = 'at_entry';
    } else if (bf.phase === 'broke') {
      finalStatusKo = '돌파·마감 검증';
    } else if (bf.phase === 'approach') {
      finalStatusKo = '돌파 대기';
      if (finalStatus === 'neutral') finalStatus = 'wait_breakout';
    }
    finalActionKo = bf.narrativeLlm
      ? `${bf.actionLineKo} · ${bf.narrativeLlm}`
      : bf.actionLineKo;
    if (finalActionKo.length > 220) finalActionKo = `${finalActionKo.slice(0, 217)}…`;
  }

  return {
    status: finalStatus,
    statusKo: finalStatusKo,
    actionKo: finalActionKo,
    confirmKo,
    invalidKo,
    rows: rows.filter((r) => r.price != null),
    rrLabel,
    whaleAligned: aligned,
    whaleLine: whaleLine(verdict, whale, aligned),
    gateLine,
    entryPlanKo,
    stopPlanKo,
    reboundPlanKo,
    riskPlanKo,
  };
}
