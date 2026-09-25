/**
 * 브리핑 — §32 확장 포맷 · "점수 높아서" 금지.
 */
import type { TapBattleZone, TapDecision, TapGateResult, TapointDecisionReport, TapScorePack } from './types';

export function oneLineReasonKo(params: {
  decision: TapDecision;
  dirPref: 'LONG' | 'SHORT' | null;
  battleZone: TapBattleZone | null;
  structureState?: string;
  scores: TapScorePack;
  gate: TapGateResult;
  sfpNote?: string | null;
  breakoutNote?: string | null;
  flowNote?: string | null;
}): string {
  const d = params.dirPref === 'SHORT' ? '숏' : '롱';
  if (params.decision === 'WAIT') {
    if (params.gate.failReasons.includes('TIP_MISSING_AI_ONLY')) {
      return '타점·전투구간 미달 · AI점수만으로 진입하지 않음 · 대기';
    }
    if (params.gate.failReasons.includes('PRICE_NOT_AT_ZONE')) {
      return '방향은 있으나 핵심 전투구간에 도달하지 않아 추격 금지 · 대기';
    }
    if (params.gate.failReasons.includes('WEAK_SINGLE_ZONE')) {
      return '존·피벗 단일근거만 존재 · 합류 전투구간 없음 · 대기';
    }
    if (params.gate.failReasons.some((x) => x.startsWith('NET_EV') || x === 'NET_EV_FAIL')) {
      return '비용·NET EV 부족 · 수수료 후 기대값 불충분 · 대기';
    }
    if (params.gate.failReasons.includes('FLOW_CONFLICT')) {
      return '오더플로 역행 · 체결흐름 미확인 · 대기';
    }
    if (params.gate.failReasons.includes('CORR_CLUSTER_LIMIT')) {
      return '동일방향 상관클러스터 한도 · 신규 진입 제한 · 대기';
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
  const bits = [
    z ? `전투구간 ${zKo}` : null,
    params.structureState ? `구조 ${params.structureState}` : null,
    params.sfpNote || null,
    params.breakoutNote || null,
    params.flowNote || null,
  ].filter(Boolean);
  return `${bits.slice(0, 3).join(' · ') || zKo} 확인 후 ${d} 실행 · 시장구조 SL`;
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

  lines.push(`★ 실전 진입 · ${r.symbol}`);
  lines.push(
    `${r.direction === 'SHORT' ? '🔴 SHORT' : r.direction === 'LONG' ? '🟢 LONG' : '⚪ WAIT'} · ${r.execKind}${r.orderType ? ` · ${r.orderType}` : ''}`
  );
  lines.push(`DECISION ${decKo} · state ${r.entryState}`);

  if (r.macro?.length) {
    lines.push('MACRO');
    for (const m of r.macro.slice(0, 5)) {
      lines.push(
        `${m.tf} ${m.direction} · ${m.location} · ${m.structure} · ${m.noteKo.slice(0, 48)}`
      );
    }
  }
  lines.push(`REGIME ${r.regimeKo}`);

  if (r.battleZone) {
    const src = r.battleZone.sources?.slice(0, 5).join('+') || '';
    lines.push(
      `핵심전투구간 ${r.battleZone.lo.toFixed(2)}~${r.battleZone.hi.toFixed(2)} · ${r.battleZone.labelKo}${src ? ` · ${src}` : ''}`
    );
  }
  if (r.liquidityMap?.summaryKo) {
    lines.push(`LIQUIDITY ${r.liquidityMap.summaryKo}`);
  }
  if (r.liquidityMap?.below?.[0]) {
    lines.push(
      `아래 ${r.liquidityMap.below[0].labelKo} ${r.liquidityMap.below[0].price.toFixed(2)}`
    );
  }
  if (r.liquidityMap?.above?.[0]) {
    lines.push(
      `위 ${r.liquidityMap.above[0].labelKo} ${r.liquidityMap.above[0].price.toFixed(2)}`
    );
  }

  if (r.extreme?.kind && r.extreme.kind !== 'NONE') {
    lines.push(`EVENT ${r.extreme.kind} · ${r.extreme.noteKo}`);
    if (r.extreme.evidence?.length) {
      lines.push(`근거 ${r.extreme.evidence.slice(0, 4).join(' · ')}`);
    }
  }
  if (r.sfpQuality?.active) lines.push(`SFP ${r.sfpQuality.noteKo}`);
  if (r.breakout?.active) lines.push(`BREAKOUT ${r.breakout.noteKo}`);
  if (r.rsiDiv?.noteKo) lines.push(`RSI ${r.rsiDiv.noteKo}`);

  if (r.flowSnap?.summaryKo) lines.push(`FLOW ${r.flowSnap.summaryKo}`);
  if (r.execNoteKo) lines.push(`TRIGGER/EXEC ${r.execNoteKo}`);

  if (r.historical?.n) {
    const up5 =
      r.historical.up5 != null ? `${(r.historical.up5 * 100).toFixed(0)}%` : '—';
    lines.push(
      `HISTORICAL N=${r.historical.n} sim=${r.historical.similarity ?? '—'} 5봉↑${up5} MFE=${r.historical.mfe != null ? (r.historical.mfe * 100).toFixed(2) + '%' : '—'} MAE=${r.historical.mae != null ? (r.historical.mae * 100).toFixed(2) + '%' : '—'} NETEV=${r.historical.netEv ?? '—'}`
    );
  }

  lines.push(
    `SCORES Dir${r.scores.direction} Loc${r.scores.location} Setup${r.scores.setup} Entry${r.scores.entry} Flow${r.scores.flow} Hist${r.scores.historical} Event${r.scores.event} Fail${r.scores.failureRisk} EV${r.scores.ev}`
  );

  if (r.netEv?.noteKo) lines.push(`NET EV ${r.netEv.noteKo}`);
  if (r.backtestSummaryKo) lines.push(`BACKTEST ${r.backtestSummaryKo}`);
  if (r.metricsNoteKo) lines.push(`METRICS ${r.metricsNoteKo}`);
  if (r.corrCluster?.noteKo) lines.push(`CORR ${r.corrCluster.noteKo}`);
  if (r.paperLive?.noteKo) lines.push(`MODE ${r.paperLive.noteKo}`);
  if (r.strategyFamily) lines.push(`전략패밀리 ${r.strategyFamily}`);

  if (r.entry != null) lines.push(`Entry ${r.entry}`);
  if (r.structuralSlNoteKo) lines.push(`Structural SL ${r.sl ?? '—'} · ${r.structuralSlNoteKo}`);
  else if (r.sl != null) lines.push(`Structural SL ${r.sl}`);
  if (r.tp1 != null) lines.push(`TP1 ${r.tp1}`);
  if (r.tp2 != null) lines.push(`TP2 ${r.tp2}`);
  if (r.tp3 != null) lines.push(`TP3 ${r.tp3}`);
  if (r.orderType) lines.push(`주문형태 ${r.orderType}`);

  lines.push(`진입 이유 ${r.reasonOneLineKo}`);
  if (r.rejectReasonKo) lines.push(`거절 ${r.rejectReasonKo}`);
  lines.push('확정 수익·승률 아님 · OOS/워크포워드 검증 필요');
  return lines.join('\n');
}
