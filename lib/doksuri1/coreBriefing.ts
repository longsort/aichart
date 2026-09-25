/**
 * Doksuri-1 — 맨 위 ▸ 핵심 + $$$$ 분석 요약 (참고 · 확정 수익 아님).
 */
import { DOMINANT_KO, type Doksuri1Fact } from '@/lib/doksuri1/types';
import { resolveDoksuri1FocusSide } from '@/lib/doksuri1/focusSide';

function fmt(n: number): string {
  return n >= 1000 ? n.toLocaleString(undefined, { maximumFractionDigits: 0 }) : n.toFixed(2);
}

function planStatusKo(status: string): string {
  if (status === 'READY') return '자리대기';
  if (status === 'WAIT_CONFIRMATION') return '확인대기';
  if (status === 'TOO_LATE') return '추격금지·늦음';
  if (status === 'BLOCKED') return '차단';
  return status;
}

/** 텔레그램/평문 ▸ 핵심 (4~7줄) */
export function buildDoksuri1CoreLines(fact: Doksuri1Fact): string[] {
  const lines: string[] = [];
  const focus = resolveDoksuri1FocusSide(fact);
  const gate =
    fact.gatesPass != null && fact.gatesTotal != null
      ? ` · 게이트 ${fact.gatesPass}/${fact.gatesTotal}`
      : '';
  lines.push(
    `행동 · ${fact.actionKo}${gate} · ${DOMINANT_KO[fact.dominantSide]} · 주방향 ${focus}`
  );

  const struct = [fact.structureLabelKo, fact.structureSummaryKo]
    .filter(Boolean)
    .join(' · ')
    .slice(0, 72);
  if (struct) lines.push(`구조 · ${struct}`);

  if (fact.nextBattleKo) {
    lines.push(`다음승부 · ${fact.nextBattleKo}`);
  }

  const moneyLines = fact.mergedDeskMoneyAnalysisKo?.length
    ? fact.mergedDeskMoneyAnalysisKo
    : [];
  if (moneyLines.length) {
    lines.push(moneyLines[0]!);
    if (moneyLines[1]) lines.push(moneyLines[1]);
  } else if (fact.mergedDeskIntelFlags?.nearMoney) {
    lines.push(`돈구간 · $$$$ 근접 · 승부후보(확정수익아님)`);
  } else {
    lines.push(`돈구간 · $$$$ 근처 약함 · 장바구니 대기`);
  }

  const ce = fact.candleEventLinesKo?.filter((s) => !s.startsWith('캔들이벤트')) ?? [];
  if (ce.length) {
    lines.push(`캔들이벤트 · ${ce[0]!.replace(/^·\s*/, '').slice(0, 64)}`);
    if (ce[1]) lines.push(ce[1].replace(/^·\s*/, '').slice(0, 64));
  }

  const inv =
    focus === 'SHORT'
      ? fact.shortPlan.invalidationKo ||
        (fact.shortPlan.stopLoss != null ? `숏무효·SL ${fmt(fact.shortPlan.stopLoss)}` : null)
      : fact.longPlan.invalidationKo ||
        (fact.longPlan.stopLoss != null ? `롱무효·SL ${fmt(fact.longPlan.stopLoss)}` : null) ||
        fact.shortPlan.invalidationKo;
  if (inv) lines.push(`무효 · ${inv.slice(0, 64)}`);

  if (focus === 'LONG') {
    lines.push(`플랜 · 롱쪽 ${planStatusKo(fact.longPlan.status)} · 숏생략`);
  } else if (focus === 'SHORT') {
    lines.push(`플랜 · 숏쪽 ${planStatusKo(fact.shortPlan.status)} · 롱생략`);
  } else {
    lines.push(
      `플랜 · 미확정 · L ${planStatusKo(fact.longPlan.status)} / S ${planStatusKo(fact.shortPlan.status)}`
    );
  }

  const warn: string[] = [];
  if (focus !== 'SHORT' && fact.shortPlan.status === 'TOO_LATE') warn.push('숏추격금지');
  if (focus !== 'LONG' && fact.longPlan.status === 'TOO_LATE') warn.push('롱추격금지');
  if (
    (focus === 'LONG' && fact.longPlan.status === 'WAIT_CONFIRMATION') ||
    (focus === 'SHORT' && fact.shortPlan.status === 'WAIT_CONFIRMATION') ||
    focus === 'WAIT'
  ) {
    warn.push('확인전진입비권장');
  }
  if ((fact.gatesPass ?? 0) < 3) warn.push('게이트부족');
  if (warn.length) lines.push(`주의 · ${warn.join(' · ')}`);

  return lines.slice(0, 10);
}
