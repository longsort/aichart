/**
 * 브리핑 문장 — "점수 높아서" 금지 · 핵심 이유 한 줄.
 */
import type { TapBattleZone, TapDecision, TapGateResult, TapointDecisionReport, TapScorePack } from './types';

export function oneLineReasonKo(params: {
  decision: TapDecision;
  dirPref: 'LONG' | 'SHORT' | null;
  battleZone: TapBattleZone | null;
  structureState?: string;
  scores: TapScorePack;
  gate: TapGateResult;
}): string {
  const d = params.dirPref === 'SHORT' ? '숏' : '롱';
  if (params.decision === 'WAIT') {
    if (params.gate.failReasons.includes('TIP_MISSING_AI_ONLY')) {
      return '타점·전투구간 미달 · AI점수만으로 진입하지 않음 · 대기';
    }
    if (params.gate.failReasons.includes('PRICE_NOT_AT_ZONE')) {
      return '방향은 있으나 핵심 전투구간에 도달하지 않아 추격 금지 · 대기';
    }
    if (params.scores.entry < 55) {
      return `방향·셋업은 있으나 진입점수 ${params.scores.entry}로 타점 불량 · 대기`;
    }
    return `필수게이트 미충족 · ${params.gate.failReasons.slice(0, 2).join('·') || '대기'}`;
  }
  const z = params.battleZone;
  const zKo = z ? `${z.lo.toFixed(2)}~${z.hi.toFixed(2)}` : '핵심구간';
  if (params.decision.startsWith('ARMED')) {
    return `${d} 셋업 무장 · ${zKo} 도달·리클레임·미세구조 확인 전 주문 금지`;
  }
  return `${zKo}에서 ${params.structureState || '구조'} 확인 후 ${d} 실행 · 시장구조 SL`;
}

export function buildTapointBriefingKo(r: TapointDecisionReport): string {
  const lines: string[] = [];
  const decKo =
    r.decision === 'CONFIRMED_LONG'
      ? '확정롱'
      : r.decision === 'CONFIRMED_SHORT'
        ? '확정숏'
        : r.decision === 'ARMED_LONG'
          ? '무장롱'
          : r.decision === 'ARMED_SHORT'
            ? '무장숏'
            : '대기';
  lines.push(`★ 타점엔진 · ${r.symbol} · ${r.timeframe}`);
  lines.push(`${decKo} · ${r.execKind}`);
  lines.push(`레짐 ${r.regimeKo}`);
  if (r.battleZone) {
    lines.push(
      `전투구간 ${r.battleZone.lo.toFixed(2)}~${r.battleZone.hi.toFixed(2)} · ${r.battleZone.labelKo}`
    );
  }
  lines.push(
    `점수 DIR${r.scores.direction} LOC${r.scores.location} SETUP${r.scores.setup} ENTRY${r.scores.entry} FLOW${r.scores.flow} HIST${r.scores.historical} EVENT${r.scores.event} FAIL${r.scores.failureRisk}`
  );
  if (r.extreme?.kind && r.extreme.kind !== 'NONE') {
    lines.push(`EVENT ${r.extreme.kind} · ${r.extreme.noteKo}`);
  }
  if (r.historical?.n) {
    const up5 =
      r.historical.up5 != null ? `${(r.historical.up5 * 100).toFixed(0)}%` : '—';
    lines.push(
      `HIST N=${r.historical.n} sim=${r.historical.similarity ?? '—'} 5봉↑${up5} MFE=${r.historical.mfe != null ? (r.historical.mfe * 100).toFixed(2) + '%' : '—'} MAE=${r.historical.mae != null ? (r.historical.mae * 100).toFixed(2) + '%' : '—'}`
    );
  }
  if (r.entry != null) lines.push(`Entry ${r.entry}`);
  if (r.sl != null) lines.push(`구조SL ${r.sl}`);
  if (r.tp1 != null) lines.push(`TP1 ${r.tp1}`);
  if (r.tp2 != null) lines.push(`TP2 ${r.tp2}`);
  if (r.tp3 != null) lines.push(`TP3 ${r.tp3}`);
  lines.push(r.reasonOneLineKo);
  if (r.rejectReasonKo) lines.push(`거절기록 ${r.rejectReasonKo}`);
  lines.push('확정 수익·승률 아님 · 검증 필요');
  return lines.join('\n');
}
