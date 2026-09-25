/**
 * Doksuri-1 — FACT → 한국어 전황 (템플릿 슬롯만, LLM 자유생성 없음).
 * 이모지·리스크·레버·스탑헌팅은 riskBriefing 실측 계산만 사용.
 */
import {
  DOMINANT_KO,
  type Doksuri1Fact,
  type Doksuri1Pack,
} from '@/lib/doksuri1/types';
import {
  buildDoksuri1PlanRisk,
  formatDoksuri1PlanEmojiLine,
  formatDoksuri1PlanRiskHtml,
  formatDoksuri1RiskSectionTitle,
  mapLevelEmoji,
  resolveDoksuri1RiskPrefs,
  type Doksuri1RiskPrefs,
} from '@/lib/doksuri1/riskBriefing';
import { escapeTelegramHtml, tgHighlight, tgPrice, tgSection } from '@/lib/telegramFormatHtml';
import { buildDoksuri1CoreLines } from '@/lib/doksuri1/coreBriefing';
import {
  doksuri1FocusReasonKo,
  resolveDoksuri1FocusSide,
  type Doksuri1FocusSide,
} from '@/lib/doksuri1/focusSide';

function fmt(n: number): string {
  return n >= 1000 ? n.toLocaleString(undefined, { maximumFractionDigits: 0 }) : n.toFixed(2);
}

function actionEmoji(actionKo: string): string {
  if (actionKo === 'LONG' || actionKo.includes('롱')) return '🟢';
  if (actionKo === 'SHORT' || actionKo.includes('숏')) return '🔴';
  return '⚪';
}

function bigMoneyEmoji(state: Doksuri1Fact['bigMoneyState']): string {
  if (
    state === 'SELL_ABSORPTION' ||
    state === 'STRONG_BUY' ||
    state === 'STEADY_BUY' ||
    state === 'BREAKOUT_BUY' ||
    state === 'CHASE_BUY'
  ) {
    return '🟢';
  }
  if (
    state === 'BUY_ABSORPTION' ||
    state === 'STRONG_SELL' ||
    state === 'STEADY_SELL' ||
    state === 'BREAKDOWN_SELL' ||
    state === 'CHASE_SELL'
  ) {
    return '🔴';
  }
  return '⚪';
}

/** 세력·고래·유동성 — 항상 섹션 유지(실측만, 없으면 명시) */
function formatForceWhaleLiqHtml(fact: Doksuri1Fact): string[] {
  const parts: string[] = [];
  parts.push('', tgSection('세력·고래·유동성'));

  const bmEmoji = bigMoneyEmoji(fact.bigMoneyState);
  const conf =
    fact.bigMoneyConfidence != null ? ` · 신뢰참고 ${Math.round(fact.bigMoneyConfidence)}` : '';
  parts.push(
    `🌊 ${bmEmoji} <b>세력</b> ${escapeTelegramHtml(fact.bigMoneyKo)}${escapeTelegramHtml(conf)} · 매수강도 ${Math.round(fact.buyerStrength)} / 매도강도 ${Math.round(fact.sellerStrength)}`
  );
  parts.push(
    `· 우세 ${escapeTelegramHtml(DOMINANT_KO[fact.dominantSide])}`
  );

  const whaleBits = [fact.whaleDnaKo, fact.whaleForceKo, fact.whaleBeamKo].filter(Boolean);
  if (whaleBits.length) {
    parts.push(`🧬 <b>고래</b> ${escapeTelegramHtml(whaleBits.join(' · '))}`);
    const extras: string[] = [];
    if (fact.whaleSampleN != null) extras.push(`표본 n=${fact.whaleSampleN}`);
    if (fact.whaleForecastPct != null) {
      extras.push(
        `과거중앙 ${fact.whaleForecastPct >= 0 ? '+' : ''}${fact.whaleForecastPct.toFixed(1)}%`
      );
    }
    if (extras.length) parts.push(`· ${escapeTelegramHtml(extras.join(' · '))}`);
    const whaleMap = fact.mapLevels.filter((m) => m.kind === 'whale').slice(0, 3);
    for (const m of whaleMap) {
      parts.push(
        `· ${mapLevelEmoji(m.kind)} ${tgPrice(fmt(m.price))}  ${escapeTelegramHtml(m.labelKo)}`
      );
    }
  } else {
    parts.push(
      `🧬 <b>고래</b> <i>이번 스냅 빔·DNA 없음</i> · Bitget 조회 실패·표본부족 가능`
    );
  }

  const liqMap = fact.mapLevels.filter((m) => m.kind === 'liq').slice(0, 4);
  const liqBits: string[] = [];
  if (fact.liqKo) liqBits.push(fact.liqKo);
  if (fact.fundingKo) liqBits.push(fact.fundingKo);
  if (fact.cvdState) liqBits.push(`CVD ${fact.cvdState}`);
  if (fact.oiState) liqBits.push(`OI ${fact.oiState}`);
  if (fact.derivCaseKo && fact.dataQuality.derivatives !== 'BAD') {
    liqBits.push(fact.derivCaseKo.slice(0, 72));
  }

  parts.push(`💧 <b>유동성</b>`);
  if (liqBits.length) {
    for (const b of liqBits.slice(0, 4)) {
      parts.push(`· ${escapeTelegramHtml(b)}`);
    }
  } else {
    parts.push(`· <i>청산·펀딩 집계 없음 · 맵·존 유동성만 참고</i>`);
  }
  for (const m of liqMap) {
    parts.push(
      `· 🪤 ${tgPrice(fmt(m.price))}  ${escapeTelegramHtml(m.labelKo)}`
    );
  }
  for (const z of fact.zoneScores.slice(0, 3)) {
    parts.push(
      `· 🛡 ${escapeTelegramHtml(z.labelKo)} A${z.attackScore}/D${z.defenseScore} · ${escapeTelegramHtml(z.state)}`
    );
  }

  return parts;
}

function formatForceWhaleLiqPlain(fact: Doksuri1Fact): string[] {
  const lines: string[] = [];
  lines.push('세력·고래·유동성');
  lines.push(
    `세력 ${fact.bigMoneyKo} · 매수 ${Math.round(fact.buyerStrength)} / 매도 ${Math.round(fact.sellerStrength)} · ${DOMINANT_KO[fact.dominantSide]}`
  );
  const whaleBits = [fact.whaleDnaKo, fact.whaleForceKo, fact.whaleBeamKo].filter(Boolean);
  if (whaleBits.length) {
    let w = `고래 ${whaleBits.join(' · ')}`;
    if (fact.whaleSampleN != null) w += ` · 표본 n=${fact.whaleSampleN}`;
    if (fact.whaleForecastPct != null) w += ` · 참고도달 ${fact.whaleForecastPct}%`;
    lines.push(w);
  } else {
    lines.push('고래 이번 스냅 빔·DNA 없음');
  }
  if (fact.liqKo) lines.push(`유동성 ${fact.liqKo}`);
  if (fact.fundingKo) lines.push(fact.fundingKo);
  if (fact.cvdState || fact.oiState) {
    lines.push(`CVD ${fact.cvdState ?? '—'} · OI ${fact.oiState ?? '—'}`);
  }
  for (const m of fact.mapLevels.filter((m) => m.kind === 'liq' || m.kind === 'whale').slice(0, 4)) {
    lines.push(`  ${mapLevelEmoji(m.kind)} ${m.labelKo} ${fmt(m.price)}`);
  }
  return lines;
}

function qualityWarnLine(fact: Doksuri1Fact): string | null {
  if (fact.badSourceCount < 2) return null;
  const bad = Object.entries(fact.dataQuality)
    .filter(([, v]) => v === 'BAD')
    .map(([k]) => k)
    .slice(0, 4);
  return `데이터 품질 경고 · BAD ${fact.badSourceCount} (${bad.join(',')}) · 최종 WAIT`;
}

function appendRiskBlocks(
  parts: string[],
  fact: Doksuri1Fact,
  prefs: Doksuri1RiskPrefs,
  focus: Doksuri1FocusSide
): void {
  if (focus === 'WAIT') {
    parts.push('', formatDoksuri1RiskSectionTitle());
    parts.push(`<i>양방향 미확정 · 리스크·사이징 생략 · zone·안착 후 재산출</i>`);
    return;
  }

  const plan = focus === 'LONG' ? fact.longPlan : fact.shortPlan;
  if (plan.status === 'TOO_LATE' || plan.status === 'INVALID') {
    parts.push('', formatDoksuri1RiskSectionTitle());
    parts.push(
      `<i>${focus} ${escapeTelegramHtml(plan.status)} · 사이징 생략 · 추격 비권장</i>`
    );
    return;
  }

  const risk = buildDoksuri1PlanRisk({
    plan,
    prefs,
    mapLevels: fact.mapLevels,
    zoneScores: fact.zoneScores,
  });
  if (!risk) return;

  parts.push('', formatDoksuri1RiskSectionTitle());
  parts.push(
    `<i>예시자본·리스크% 참고 · ${focus}쪽만 · 손절 과소면 사이징 보류 · 청산≠손절</i>`
  );
  parts.push(...formatDoksuri1PlanRiskHtml(risk));
}

/** 선물 진입 게이트 — WAIT/비권장 이유를 맨 앞에 명시 */
function formatFuturesGateHtml(
  fact: Doksuri1Fact,
  prefs: Doksuri1RiskPrefs,
  focus: Doksuri1FocusSide
): string[] {
  const parts: string[] = [];
  parts.push('', tgSection('선물 진입게이트'));

  const focusPlan = focus === 'LONG' ? fact.longPlan : focus === 'SHORT' ? fact.shortPlan : null;
  const focusRisk = focusPlan
    ? buildDoksuri1PlanRisk({
        plan: focusPlan,
        prefs,
        mapLevels: fact.mapLevels,
        zoneScores: fact.zoneScores,
      })
    : null;

  const reasons: string[] = [];
  if (focus === 'WAIT') reasons.push('zone·방향 미확정 · 양방향 풀진입 비권장');
  if (fact.action === 'WAIT' || fact.actionKo === 'WAIT') {
    reasons.push('행동 WAIT · 확정 방향 아님');
  }
  if (focus === 'LONG' && fact.structureLabelKo?.includes('하락')) {
    reasons.push('구조 하락 쪽 신호와 롱 관찰 충돌 가능');
  }
  if (focus === 'SHORT' && fact.shortPlan.status === 'TOO_LATE') {
    reasons.push('SHORT TOO_LATE · 이미 지나간 숏E');
  }
  if (focus === 'LONG' && fact.longPlan.status === 'TOO_LATE') {
    reasons.push('LONG TOO_LATE · 이미 지나간 롱E');
  }
  if (focusRisk?.sizingUnsafe) reasons.push(`${focus} 손절/RR 이상 · 사이징 보류`);
  if (fact.badSourceCount >= 2) reasons.push('데이터 품질 BAD 다수');

  const canEnter =
    focus !== 'WAIT' &&
    (fact.action === 'CONFIRMED_LONG' || fact.action === 'CONFIRMED_SHORT') &&
    !focusRisk?.sizingUnsafe &&
    fact.badSourceCount < 2;

  if (!canEnter) {
    parts.push(`⏸ <b>지금 진입 비권장</b> · 관망·자리대기`);
    for (const r of reasons.slice(0, 5)) {
      parts.push(`· ${escapeTelegramHtml(r)}`);
    }
  } else {
    parts.push(
      `▶ <b>조건부 관찰</b> · ${escapeTelegramHtml(fact.actionKo)} · ${focus}쪽 · 그래도 추격 금지 · SL·청산가 필수`
    );
  }

  parts.push(
    `<i>이 텔레 메시지만으로 시장가 진입하지 마세요 · 차트·상위TF·청산가 재확인</i>`
  );
  if (fact.fundingKo) {
    parts.push(`💸 ${escapeTelegramHtml(fact.fundingKo)} · 보유 중 펀딩 비용 발생`);
  }
  return parts;
}

function planRangeKo(plan: Doksuri1Fact['longPlan']): string | null {
  if (plan.entryLow != null && plan.entryHigh != null) {
    const lo = Math.min(plan.entryLow, plan.entryHigh);
    const hi = Math.max(plan.entryLow, plan.entryHigh);
    return `${fmt(lo)}~${fmt(hi)}`;
  }
  if (plan.entry != null) return fmt(plan.entry);
  return null;
}

function telegramVerdict(
  fact: Doksuri1Fact,
  focus: Doksuri1FocusSide
): { emoji: string; title: string; mode: string } {
  if (fact.action === 'CONFIRMED_LONG') {
    return { emoji: '🟢', title: '확정롱', mode: '타점확인' };
  }
  if (fact.action === 'CONFIRMED_SHORT') {
    return { emoji: '🔴', title: '확정숏', mode: '타점확인' };
  }
  if (fact.action === 'WATCH_LONG' || (focus === 'LONG' && fact.action === 'WAIT')) {
    return { emoji: '🟢', title: '롱관찰', mode: '자리대기' };
  }
  if (fact.action === 'WATCH_SHORT' || (focus === 'SHORT' && fact.action === 'WAIT')) {
    return { emoji: '🔴', title: '숏관찰', mode: '자리대기' };
  }
  return { emoji: '⚪', title: '대기', mode: '관망' };
}

function planIncomplete(plan: Doksuri1Fact['longPlan']): boolean {
  return (
    plan.status === 'WAIT_CONFIRMATION' ||
    plan.status === 'WAIT_PULLBACK' ||
    !plan.entry ||
    plan.confirmationCount < plan.confirmationTotal
  );
}

function formatMainPlanLevelsHtml(plan: Doksuri1Fact['longPlan']): string[] {
  const parts: string[] = [];
  if (plan.entry != null) parts.push(`진입  ${tgPrice(fmt(plan.entry))}`);
  if (plan.stopLoss != null) {
    parts.push(`손절  ${tgPrice(fmt(plan.stopLoss))}  · 무효`);
  }
  const tps = [plan.tp1, plan.tp2, plan.tp3].filter(
    (n): n is number => n != null && Number.isFinite(n)
  );
  if (tps.length) {
    parts.push(`목표  ${tps.map((n) => tgPrice(fmt(n))).join('  /  ')}`);
  }
  if (!parts.length) {
    parts.push(escapeTelegramHtml(formatDoksuri1PlanEmojiLine(plan)));
  }
  return parts;
}

function formatFocusPlanTelegramHtml(fact: Doksuri1Fact, focus: Doksuri1FocusSide): string[] {
  if (focus === 'WAIT') {
    const parts: string[] = ['', '<b>주플랜 없음 · 대기</b>', '지금 시장가 금지'];
    if (fact.longPlan.entry != null) {
      parts.push(`롱참고  ${tgPrice(fmt(fact.longPlan.entry))}  · 진입금지`);
    }
    if (fact.shortPlan.entry != null) {
      parts.push(`숏참고  ${tgPrice(fmt(fact.shortPlan.entry))}  · 진입금지`);
    }
    return parts;
  }

  const plan = focus === 'LONG' ? fact.longPlan : fact.shortPlan;
  const other = focus === 'LONG' ? fact.shortPlan : fact.longPlan;
  const sideKo = focus === 'LONG' ? '롱' : '숏';
  const parts: string[] = ['', `<b>주플랜 ${sideKo}</b>`];
  const range = planRangeKo(plan);
  if (range) {
    parts.push(
      escapeTelegramHtml(
        `${range} ${focus === 'LONG' ? '반응' : '거부'} 확인 후`
      )
    );
  }
  parts.push(...formatMainPlanLevelsHtml(plan));
  if (planIncomplete(plan)) parts.push('조건 미완성 → 진입금지');
  if (plan.chaseForbidden || plan.status === 'TOO_LATE') {
    parts.push(focus === 'LONG' ? '지금 추격롱 금지' : '지금 추격숏 금지');
  }
  if (plan.status === 'INVALID') {
    parts.push(`${sideKo} 무효 · 재설계`);
  }
  if (other.entry != null) {
    parts.push(
      `반대 ${other.direction === 'LONG' ? '롱' : '숏'}  ${tgPrice(fmt(other.entry))}  · 진입금지`
    );
  }
  return parts;
}

/** UI 카드용 슬롯 */
export function buildDoksuri1CardKo(fact: Doksuri1Fact): Doksuri1Pack['cardKo'] {
  const mapLines = fact.mapLevels.slice(0, 8).map((m) => {
    const hi = m.priceHi != null ? `~${fmt(m.priceHi)}` : '';
    return `${mapLevelEmoji(m.kind)} ${m.labelKo} ${fmt(m.price)}${hi}`;
  });
  return {
    headline: `${DOMINANT_KO[fact.dominantSide]} · ${fact.bigMoneyKo} · ${fact.actionKo}`,
    mapLines,
    liveLines: fact.liveChainKo.slice(0, 5),
    longOneLine: formatDoksuri1PlanEmojiLine(fact.longPlan),
    shortOneLine: formatDoksuri1PlanEmojiLine(fact.shortPlan),
    nextBattle: fact.nextBattleKo ? `다음 승부 ${fact.nextBattleKo}` : '다음 승부 미정',
    action: fact.actionKo,
  };
}

/** 평문 스토리 */
export function buildDoksuri1StoryPlain(
  fact: Doksuri1Fact,
  riskPrefs?: Doksuri1RiskPrefs | null
): string {
  const prefs = resolveDoksuri1RiskPrefs(riskPrefs);
  const lines: string[] = [];
  lines.push(`[독수리1호 전황] ${fact.symbol} ${fact.timeframe}`);
  lines.push(
    `결론 ${DOMINANT_KO[fact.dominantSide]} · ${fact.bigMoneyKo} · 행동 ${fact.actionKo}` +
      (fact.confidence != null ? ` · 합류참고 ${fact.confidence}` : '')
  );
  const qw = qualityWarnLine(fact);
  if (qw) lines.push(qw);

  const core = buildDoksuri1CoreLines(fact);
  if (core.length) {
    lines.push('핵심');
    for (const s of core) lines.push(`  ${s}`);
  }
  if (fact.mergedDeskMoneyAnalysisKo?.length) {
    lines.push('$$$$분석');
    for (const s of fact.mergedDeskMoneyAnalysisKo.slice(0, 5)) {
      lines.push(`  ${s}`);
    }
  }
  if (fact.candleEventLinesKo?.length) {
    lines.push('캔들이벤트');
    for (const s of fact.candleEventLinesKo.slice(0, 5)) {
      lines.push(`  ${s}`);
    }
  }

  if (fact.structureLabelKo || fact.structureSummaryKo) {
    lines.push(
      `구조 ${[fact.structureLabelKo, fact.structureSummaryKo].filter(Boolean).join(' · ')}`
    );
  }

  if (fact.mergedDeskIntelLinesKo?.length) {
    lines.push('통합데스크맵');
    for (const s of fact.mergedDeskIntelLinesKo.slice(0, 20)) {
      lines.push(`  ${s}`);
    }
  }

  lines.push(...formatForceWhaleLiqPlain(fact));
  if (fact.volumeLineKo) lines.push(fact.volumeLineKo);

  if (fact.mapLevels.length) {
    lines.push('가격지도(위→아래)');
    for (const m of fact.mapLevels.slice(0, 8)) {
      const hi = m.priceHi != null ? `~${fmt(m.priceHi)}` : '';
      lines.push(`  ${mapLevelEmoji(m.kind)} ${m.labelKo} ${fmt(m.price)}${hi}`);
    }
  }

  if (fact.liveChainKo.length) {
    lines.push('LIVE');
    for (const s of fact.liveChainKo) lines.push(`  → ${s}`);
  }

  const focus = resolveDoksuri1FocusSide(fact);
  lines.push(`주플랜 · ${doksuri1FocusReasonKo(fact, focus)}`);
  if (focus === 'LONG') {
    lines.push(formatDoksuri1PlanEmojiLine(fact.longPlan));
    lines.push(`반대숏 · ${fact.shortPlan.status} · 생략`);
  } else if (focus === 'SHORT') {
    lines.push(formatDoksuri1PlanEmojiLine(fact.shortPlan));
    lines.push(`반대롱 · ${fact.longPlan.status} · 생략`);
  } else {
    lines.push(formatDoksuri1PlanEmojiLine(fact.longPlan));
    lines.push(formatDoksuri1PlanEmojiLine(fact.shortPlan));
    lines.push('미확정 · 한줄참고만 · 풀사이징 없음');
  }
  if (fact.nextBattleKo) lines.push(`다음 승부 ${fact.nextBattleKo}`);

  if (focus === 'WAIT') {
    lines.push('리스크 · 양방향 미확정 · 사이징 생략');
  } else {
    const plan = focus === 'LONG' ? fact.longPlan : fact.shortPlan;
    if (plan.status === 'TOO_LATE' || plan.status === 'INVALID') {
      lines.push(`리스크 · ${focus} ${plan.status} · 사이징 생략`);
    } else {
      const r = buildDoksuri1PlanRisk({
        plan,
        prefs,
        mapLevels: fact.mapLevels,
        zoneScores: fact.zoneScores,
      });
      if (r) {
        lines.push(
          `${r.direction} 리스크: 자본 ${fmt(r.accountUsdt)} · ${r.riskPct}%(${fmt(r.riskUsdt)}) · 손절 ${r.stopDistPct.toFixed(2)}% → 최대포지션 ${fmt(r.maxNotionalUsdt)} · 레버참고 ${(r.maxNotionalUsdt / Math.max(r.accountUsdt, 1)).toFixed(1)}x(마진=자본)`
        );
        if (r.huntLevels.length) {
          lines.push(
            `  스탑헌팅: ${r.huntLevels.map((h) => `${fmt(h.price)} ${h.labelKo}`).join(' · ')}`
          );
        }
      }
    }
  }

  const detail: string[] = [];
  if (fact.derivCaseKo && fact.dataQuality.derivatives !== 'BAD') {
    detail.push(fact.derivCaseKo);
  }
  if (fact.fundingKo) detail.push(fact.fundingKo);
  if (fact.liqKo) detail.push(fact.liqKo);
  if (fact.absorptionNoteKo && fact.dataQuality.orderflow !== 'BAD') {
    detail.push(fact.absorptionNoteKo);
  }
  if (fact.learningLineKo) detail.push(fact.learningLineKo);
  if (fact.zoneScores.length) {
    for (const z of fact.zoneScores.slice(0, 4)) {
      detail.push(`${z.labelKo} A${z.attackScore}/D${z.defenseScore} · ${z.state}`);
    }
  }
  for (const p of fact.paths) {
    const pts = p.points.map(fmt).join('→');
    const prob =
      p.probabilityPct != null ? ` · 표본확률참고 ${p.probabilityPct}%` : '';
    detail.push(`${p.id} ${p.conditionKo}${prob}${pts ? ` · ${pts}` : ''}`);
  }
  if (fact.tipKo) detail.push(fact.tipKo);
  if (detail.length) {
    lines.push('▼상세(원시지표)');
    for (const d of detail) lines.push(`  ${d}`);
  }

  return lines.join('\n');
}

function formatTelegramHeaderHtml(fact: Doksuri1Fact, focus: Doksuri1FocusSide): string[] {
  const v = telegramVerdict(fact, focus);
  const parts: string[] = [
    tgHighlight(
      `🦅 ${escapeTelegramHtml(fact.symbol)} · ${escapeTelegramHtml(fact.timeframe)}`
    ),
    '━━━━━━━━━━━━━━━━',
    `${v.emoji} <b>${escapeTelegramHtml(v.title)}</b> · ${escapeTelegramHtml(v.mode)}`,
    `지금 ${tgPrice(fmt(fact.currentPrice))}`,
  ];
  const qw = qualityWarnLine(fact);
  if (qw) parts.push(`⚠️ ${escapeTelegramHtml(qw)}`);
  const confirmed =
    fact.action === 'CONFIRMED_LONG' || fact.action === 'CONFIRMED_SHORT';
  if (!confirmed) {
    const gate =
      fact.gatesPass != null && fact.gatesTotal != null
        ? ` · 게이트 ${fact.gatesPass}/${fact.gatesTotal}`
        : '';
    parts.push(`지금 시장가 금지${gate}`);
  }
  if (fact.mergedDeskIntelFlags?.nearDump) {
    parts.push('폭락존 근접 · 경로·방어선 우선');
  }
  parts.push('━━━━━━━━━━━━━━━━');
  return parts;
}

/** 사진 캡션 — 방향·타점만 (1024자 한도) */
export function formatDoksuri1TelegramCaptionHtml(fact: Doksuri1Fact): string {
  const focus = resolveDoksuri1FocusSide(fact);
  const v = telegramVerdict(fact, focus);
  const lines: string[] = [
    tgHighlight(`🦅 ${escapeTelegramHtml(fact.symbol)} · ${escapeTelegramHtml(fact.timeframe)}`),
    `${v.emoji} <b>${escapeTelegramHtml(v.title)}</b> · ${escapeTelegramHtml(v.mode)}`,
    `지금 ${tgPrice(fmt(fact.currentPrice))}`,
  ];
  const plan =
    focus === 'LONG' ? fact.longPlan : focus === 'SHORT' ? fact.shortPlan : null;
  if (plan?.entry != null) {
    const tps = [plan.tp1, plan.tp2, plan.tp3]
      .filter((n): n is number => n != null && Number.isFinite(n))
      .map((n) => fmt(n));
    const sl = plan.stopLoss != null ? ` · 손절 ${fmt(plan.stopLoss)}` : '';
    const tp = tps.length ? ` · 목표 ${tps.join('/')}` : '';
    lines.push(escapeTelegramHtml(`진입 ${fmt(plan.entry)}${sl}${tp}`));
  } else {
    lines.push('타점 없음 · 시장가 금지');
  }
  lines.push('<i>지금 시장가 금지 · 확정 수익 아님</i>');
  return lines.join('\n');
}

/** 텔레그램 HTML — 방향 하나 · 진입/손절/목표만 (시그널 카드) */
export function formatDoksuri1TelegramHtml(
  fact: Doksuri1Fact,
  _riskPrefs?: Doksuri1RiskPrefs | null
): string {
  const focus = resolveDoksuri1FocusSide(fact);
  const v = telegramVerdict(fact, focus);
  const parts: string[] = [];
  parts.push(...formatTelegramHeaderHtml(fact, focus));
  parts.push(...formatFocusPlanTelegramHtml(fact, focus));

  if (fact.nextBattleKo) {
    parts.push('', '<b>다음</b>', escapeTelegramHtml(fact.nextBattleKo.slice(0, 80)));
  }

  const why = fact.structureSummaryKo || fact.tipKo;
  if (why) {
    parts.push('', escapeTelegramHtml(why.slice(0, 90)));
  }

  parts.push(
    '',
    `할 일 → ${v.emoji} ${tgHighlight(v.title)} · ${escapeTelegramHtml(v.mode)}`
  );
  parts.push('', '<i>조건부 참고 · 확정 매매·수익 보장 아님</i>');

  let html = parts.join('\n');
  if (html.length > 1800) {
    html = `${html.slice(0, 1700)}\n…\n<i>조건부 참고 · 확정 매매·수익 보장 아님</i>`;
  }
  return html;
}

export function buildDoksuri1StoryPack(
  fact: Doksuri1Fact,
  riskPrefs?: Doksuri1RiskPrefs | null
): Omit<Doksuri1Pack, 'fact'> {
  return {
    storyHtml: formatDoksuri1TelegramHtml(fact, riskPrefs),
    storyPlain: buildDoksuri1StoryPlain(fact, riskPrefs),
    cardKo: buildDoksuri1CardKo(fact),
  };
}
