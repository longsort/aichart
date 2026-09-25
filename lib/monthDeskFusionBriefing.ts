/**
 * 마감·안착 데스크: 엔진·MTF·마감존 표를 한 덩어리로 묶어 GPT 브리핑용 텍스트 생성.
 * 투자 권유·확정 수익 표현 금지 — 컨텍스트 나열·리스크 인지용.
 */
import type { AnalyzeResponse } from '@/types';
import type { MonthDeskVerdictValidationSummary } from '@/lib/monthDeskClosingEngine';
import {
  MTF_SIGNAL_BOARD_TFS,
  mtfBoardDigestRocketBandLastPrevHot,
  mtfCardRowLastPrevBarsForTelegram,
  monthDeskMtfTelegramTriggerHot,
  type MtfSignalBoardDigest,
} from '@/lib/mtfSignalBoardDigest';
import { normalizeChartTimeframe } from '@/lib/constants';
import { buildBriefingContext, briefingContextToPromptText } from '@/lib/briefingContext';
import type { TfCloseSettleBoard } from '@/lib/tfCloseSettleAssessment';

export type MonthDeskFusionMtfRow = {
  tf: string;
  verdict: string;
  confidence: number;
  board?: MtfSignalBoardDigest;
};

function linesFromCloseSettleBoard(board: TfCloseSettleBoard | null): string[] {
  if (!board?.rows?.length) return [];
  const out: string[] = [`[마감·안착 표] asOf UTC: ${board.asOfUtcIso}`];
  for (const r of board.rows) {
    const bullets = r.formingBullets?.slice(0, 3).join(' / ') || '';
    out.push(
      `- ${r.tf}: 전봉확정 ${r.confirmedEdge} · 진행참고 ${r.formingVerdict}(점수 ${r.formingScore}) · 갭 ${r.gapFromPriorClosePct >= 0 ? '+' : ''}${r.gapFromPriorClosePct.toFixed(2)}%${bullets ? ` · ${bullets}` : ''}`,
    );
  }
  if (board.disclaimer) out.push(`  (${board.disclaimer})`);
  return out;
}

function linesFromVerdictValidation(v: MonthDeskVerdictValidationSummary | null): string[] {
  if (!v?.windows?.length) return [];
  const w = v.windows.map((x) => `${x.bars}봉: 안착${x.ok}/실패${x.fail}/불안${x.nervous}`).join(' | ');
  return [`[차트 TF ${v.chartTf} 과거 검증] ${w}`, v.footnote ? `  ${v.footnote}` : ''].filter(Boolean);
}

function linesFromMtfSignals(
  mtfSignals: MonthDeskFusionMtfRow[],
  sticky: Record<string, MtfSignalBoardDigest> | undefined,
): string[] {
  const out: string[] = ['[MTF 15m→1M 요약]'];
  for (const tfKey of MTF_SIGNAL_BOARD_TFS) {
    const row = mtfSignals.find((m) => normalizeChartTimeframe(m.tf) === normalizeChartTimeframe(String(tfKey)));
    const sb = sticky?.[tfKey];
    const { lastBar, prevBar } = mtfCardRowLastPrevBarsForTelegram(row, sb);
    const hot = monthDeskMtfTelegramTriggerHot(lastBar, prevBar);
    const v = row?.verdict ?? 'WATCH';
    const c = row?.confidence ?? '-';
    const bits: string[] = [];
    if (lastBar.rocketLong || prevBar.rocketLong) bits.push('🚀L');
    if (lastBar.rocketShort || prevBar.rocketShort) bits.push('📉S');
    if (lastBar.bandLong || prevBar.bandLong) bits.push('밴드L');
    if (lastBar.bandShort || prevBar.bandShort) bits.push('밴드S');
    if (lastBar.closingLong || prevBar.closingLong) bits.push('⟡L');
    if (lastBar.closingShort || prevBar.closingShort) bits.push('⟡S');
    const digestHot = mtfBoardDigestRocketBandLastPrevHot(row?.board) || mtfBoardDigestRocketBandLastPrevHot(sb);
    out.push(
      `- ${String(tfKey).toUpperCase()}: verdict ${v} ${c}% · 롱숏관련신호 ${hot ? 'ON' : 'off'}${digestHot ? '(로켓/밴드/⟡)' : ''}${bits.length ? ` [${bits.join('·')}]` : ''}`,
    );
  }
  return out;
}

function linesFromAnalysisExtras(a: AnalyzeResponse | null): string[] {
  if (!a) return [];
  const lines: string[] = ['[엔진 보강 피처]'];
  const sz = a.settlementZone;
  if (sz && sz.state !== 'none') {
    lines.push(
      `- 안착ZONE: ${sz.state} · ${sz.direction} · 점수 ${sz.score} (${sz.grade})${sz.level != null ? ` · 레벨 ${sz.level}` : ''}`,
    );
  }
  const fr = a.frontRunSignal;
  if (fr && fr.state !== 'NO_SIGNAL') {
    lines.push(
      `- 선행트리거: ${fr.state} · ${fr.direction} · 신뢰도 ${fr.confidence}% · ctx/setup/trg ${fr.contextScore}/${fr.setupScore}/${fr.triggerScore}`,
    );
  }
  const fus = a.aiFusionSignal;
  if (fus) {
    const nar = (fus.narrativeLlm || fus.narrative || fus.markerLabel || '').slice(0, 220);
    lines.push(`- AI융합: ${fus.verdict} · 등급 ${fus.tier ?? '-'} · ${nar}`);
  }
  const bf = a.breakoutFollow;
  if (bf && bf.phase !== 'idle') {
    lines.push(`- [돌파·연동 체인] ${bf.phase} · ${bf.bias} · ${bf.headlineKo}`);
    lines.push(`  · 상방: ${bf.upPath.map((n) => `${n.labelKo} ${n.price}`).join(' → ') || '—'}`);
    lines.push(`  · 하방: ${bf.downPath.map((n) => `${n.labelKo} ${n.price}`).join(' → ') || '—'}`);
    if (bf.narrativeLlm) lines.push(`  · AI: ${bf.narrativeLlm.slice(0, 200)}`);
  }
  const ls = a.lsSignalPlan;
  if (ls) {
    lines.push(
      `- L/S플랜: ${ls.direction} · 진입 ${ls.entry} / SL ${ls.stopLoss} · RR ${ls.rr?.toFixed?.(2) ?? ls.rr}${ls.structureNote ? ` · ${ls.structureNote}` : ''}`,
    );
  }
  const sm = a.smartMoneyMvpSignal;
  if (sm) {
    lines.push(`- 고래MVP: ${sm.state} · 총점 ${sm.totalScore} · ${(sm.reasons || []).slice(0, 3).join('; ')}`);
  }
  const so = a.smartOverlay?.confirmation;
  if (so?.headline_ko) {
    lines.push(`- 스마트오버레이 확정: ${so.headline_ko} (${so.headline}) · ${so.progress_ko || ''}`.trim());
  }
  const p3 = a.pre3Sparkle;
  if (p3?.enabled && p3.matched) {
    lines.push(`- pre3스파클: 유사도 ${p3.similarity}% · 방향 ${p3.direction}`);
  }
  if (lines.length === 1) return [];
  return lines;
}

const GPT_INSTRUCTION = `당신은 암호화폐 선물 차트 분석 도우미입니다.
아래 블록은 **앱 서버 엔진·집계 결과**입니다(실시간 호가 전체가 아닐 수 있음).
요청: **한국어**로 (1) 현재 국면 요약 (2) 상위 TF와의 정합/충돌 (3) 무효화·리스크 (4) 확인하면 좋은 체크리스트.
**금지**: 확정 수익·승률·매수/매도 지시·"확실" 등 과장.
**길이**: 핵심 위주 12~22문장 내외.`;

/**
 * GPT(OpenAI) `/api/chat` user 메시지 본문 — `buildBriefingContext` + 마감·안착 전용 보강.
 */
export function composeMonthDeskGptUserPrompt(args: {
  analysis: AnalyzeResponse | null;
  chartTf: string;
  verdict: MonthDeskVerdictValidationSummary | null;
  mtfSignals: MonthDeskFusionMtfRow[];
  mtfBoardStickyByTf: Record<string, MtfSignalBoardDigest> | undefined;
  closeSettleBoard: TfCloseSettleBoard | null;
}): string {
  const { analysis, chartTf, verdict, mtfSignals, mtfBoardStickyByTf, closeSettleBoard } = args;
  const engineBlock = analysis
    ? briefingContextToPromptText(buildBriefingContext(analysis as Parameters<typeof buildBriefingContext>[0]))
    : 'symbol: (분석 없음)';
  const extra = [
    '',
    '--- 마감·안착 데스크 보강 (차·엔진·MTF) ---',
    `현재 차트 TF: ${chartTf}`,
    ...linesFromVerdictValidation(verdict),
    ...linesFromCloseSettleBoard(closeSettleBoard),
    ...linesFromMtfSignals(mtfSignals, mtfBoardStickyByTf),
    ...linesFromAnalysisExtras(analysis),
    '',
    '위 수치·라벨을 근거로 브리핑을 작성하세요.',
  ].join('\n');

  return [GPT_INSTRUCTION, '', '--- 엔진 공통 컨텍스트 ---', engineBlock, extra].join('\n');
}
