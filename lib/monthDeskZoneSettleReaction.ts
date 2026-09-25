/**
 * 마감·안착 — 존/플랜 라인 돌파·안착을 봉 단위로 판정해 차트 선반응(확정·후보·실패).
 * 교육·참고용 — 수익·승률 보장 아님.
 */
import type { AnalyzeResponse, Candle, OverlayItem } from '@/types';
import type { ClosingEnvelopeFuturesScenario } from '@/lib/institutionalSuperBand';
import type { TfCloseSettleRow } from '@/lib/tfCloseSettleAssessment';
import { MONTH_DESK_TRAINER } from '@/lib/monthDeskChartTrainerTheme';

export type MonthDeskZoneSettleState = 'confirmed' | 'candidate' | 'failed' | 'watch';

export type MonthDeskZoneSettleReaction = {
  bias: 'LONG' | 'SHORT' | 'NEUTRAL';
  state: MonthDeskZoneSettleState;
  headlineKo: string;
  pinLabel: string;
  levelKo: string;
  bullets: string[];
  color: string;
  bgColor: string;
  borderColor: string;
};

function priceOf(pack: OverlayItem[], id: string): number | null {
  const o = pack.find((x) => x.id === id);
  const p = o?.price1 ?? o?.price2;
  return typeof p === 'number' && Number.isFinite(p) ? p : null;
}

function zoneBounds(
  pack: OverlayItem[],
  id: string
): { top: number; bot: number } | null {
  const z = pack.find((x) => x.id === id);
  if (!z) return null;
  const p1 = Number(z.price1);
  const p2 = Number(z.price2);
  if (!Number.isFinite(p1) || !Number.isFinite(p2)) return null;
  return { top: Math.max(p1, p2), bot: Math.min(p1, p2) };
}

function epsFor(level: number): number {
  return Math.max(Math.abs(level) * 0.00035, 1e-8);
}

function holdClosesBeyond(
  candles: Candle[],
  fromIdx: number,
  level: number,
  dir: 'above' | 'below',
  need = 2
): boolean {
  let n = 0;
  const eps = epsFor(level);
  for (let i = Math.max(0, fromIdx); i < candles.length; i++) {
    const cl = Number(candles[i]?.close);
    if (!Number.isFinite(cl)) continue;
    const ok = dir === 'above' ? cl >= level - eps : cl <= level + eps;
    if (ok) n++;
    else if (i >= candles.length - 2) break;
    else n = 0;
  }
  return n >= need;
}

function volSma(candles: Candle[], endExclusive: number, len = 20): number {
  const to = Math.min(endExclusive, candles.length) - 1;
  const from = Math.max(0, to - len + 1);
  let s = 0;
  let c = 0;
  for (let i = from; i <= to; i++) {
    s += Number(candles[i]?.volume) || 0;
    c++;
  }
  return c > 0 ? s / c : 0;
}

/** 돌파·이탈 봉 거래량이 최근 평균 이상인지 (캔들분석 structureConfirm과 동일 계열) */
function breakoutVolumeOk(candles: Candle[], breakIdx: number, minRatio = 1.12): boolean {
  if (breakIdx < 0 || breakIdx >= candles.length) return false;
  const v = Number(candles[breakIdx]?.volume) || 0;
  const ma = volSma(candles, breakIdx, 20);
  return ma > 0 && v >= ma * minRatio;
}

/** 돌파 후 레벨 리테스트 — 꼬리 이탈 시 실패 */
function retestAfterBreak(
  candles: Candle[],
  breakIdx: number,
  level: number,
  dir: 'above' | 'below'
): { touched: boolean; violated: boolean; volOk: boolean } {
  const eps = epsFor(level);
  let touched = false;
  let violated = false;
  let retestIdx = -1;
  for (let i = breakIdx + 1; i < candles.length; i++) {
    const c = candles[i]!;
    const touch =
      dir === 'above' ? Number(c.low) <= level + eps : Number(c.high) >= level - eps;
    if (!touch) continue;
    touched = true;
    retestIdx = i;
    violated =
      dir === 'above' ? Number(c.low) < level - eps : Number(c.high) > level + eps;
    break;
  }
  let volOk = false;
  if (retestIdx >= 0) {
    const ma = volSma(candles, retestIdx, 20);
    const v = Number(candles[retestIdx]?.volume) || 0;
    volOk = ma > 0 && v >= ma;
  }
  return { touched, violated, volOk };
}

/** 돌파 봉 마감 품질 — 레인지 상·하단 마감(거부꼬리 여지) */
function breakCloseQuality(c: Candle, dir: 'above' | 'below'): 'strong' | 'weak' | 'neutral' {
  const o = Number(c.open);
  const h = Number(c.high);
  const l = Number(c.low);
  const cl = Number(c.close);
  const range = Math.max(1e-12, h - l);
  const pos = (cl - l) / range;
  if (dir === 'above') {
    if (pos >= 0.72 && h - Math.max(o, cl) <= range * 0.15) return 'strong';
    if (pos <= 0.42 || h - Math.max(o, cl) >= range * 0.32) return 'weak';
  } else {
    if (pos <= 0.28 && Math.min(o, cl) - l <= range * 0.15) return 'strong';
    if (pos >= 0.58 || Math.min(o, cl) - l >= range * 0.32) return 'weak';
  }
  return 'neutral';
}

function findBreakIndex(
  candles: Candle[],
  level: number,
  dir: 'above' | 'below'
): number {
  const eps = epsFor(level);
  for (let i = 1; i < candles.length; i++) {
    const prev = candles[i - 1]!;
    const cur = candles[i]!;
    const wasBelow = Number(prev.close) < level - eps;
    const wasAbove = Number(prev.close) > level + eps;
    const nowAbove = Number(cur.close) >= level - eps;
    const nowBelow = Number(cur.close) <= level + eps;
    if (dir === 'above' && wasBelow && nowAbove) return i;
    if (dir === 'below' && wasAbove && nowBelow) return i;
  }
  return -1;
}

type LevelProbe = {
  key: string;
  levelKo: string;
  level: number;
  dir: 'above' | 'below';
  weight: number;
};

function buildProbes(pack: OverlayItem[]): LevelProbe[] {
  const probes: LevelProbe[] = [];
  const entry = priceOf(pack, 'month-desk-plan-entry');
  const sl = priceOf(pack, 'month-desk-plan-sl');
  const tp1 = priceOf(pack, 'month-desk-plan-tp1');
  const inv = priceOf(pack, 'month-desk-anchor-invalidation');
  const reward = zoneBounds(pack, 'month-desk-plan-reward-zone');
  const risk = zoneBounds(pack, 'month-desk-plan-risk-zone');

  if (entry != null) {
    probes.push({ key: 'entry-up', levelKo: '진입선', level: entry, dir: 'above', weight: 92 });
    probes.push({ key: 'entry-dn', levelKo: '진입선', level: entry, dir: 'below', weight: 88 });
  }
  if (reward != null) {
    probes.push({
      key: 'reward-top',
      levelKo: '수익존 상단',
      level: reward.top,
      dir: 'above',
      weight: 78,
    });
    probes.push({
      key: 'reward-bot',
      levelKo: '수익존 하단',
      level: reward.bot,
      dir: 'below',
      weight: 70,
    });
  }
  if (risk != null) {
    probes.push({ key: 'risk-top', levelKo: '위험존 상단', level: risk.top, dir: 'above', weight: 65 });
    probes.push({ key: 'risk-bot', levelKo: '위험존 하단', level: risk.bot, dir: 'below', weight: 82 });
  }
  if (sl != null) {
    probes.push({ key: 'sl-dn', levelKo: '손절', level: sl, dir: 'below', weight: 95 });
    probes.push({ key: 'sl-up', levelKo: '손절', level: sl, dir: 'above', weight: 72 });
  }
  if (tp1 != null) {
    probes.push({ key: 'tp1-up', levelKo: '목표 TP1', level: tp1, dir: 'above', weight: 74 });
  }
  if (inv != null) {
    probes.push({ key: 'inv-dn', levelKo: '무효화', level: inv, dir: 'below', weight: 90 });
    probes.push({ key: 'inv-up', levelKo: '무효화', level: inv, dir: 'above', weight: 90 });
  }
  return probes;
}

function reactionFromProbe(
  candles: Candle[],
  probe: LevelProbe
): { state: MonthDeskZoneSettleState; bias: 'LONG' | 'SHORT'; bullets: string[] } | null {
  const bi = findBreakIndex(candles, probe.level, probe.dir);
  if (bi < 0) return null;
  const hold = holdClosesBeyond(candles, bi, probe.level, probe.dir, 2);
  const breakVolOk = breakoutVolumeOk(candles, bi);
  const retest = retestAfterBreak(candles, bi, probe.level, probe.dir);
  const cq = breakCloseQuality(candles[bi]!, probe.dir);
  const last = candles[candles.length - 1]!;
  const eps = epsFor(probe.level);
  const cl = Number(last.close);
  const still =
    probe.dir === 'above' ? cl >= probe.level - eps : cl <= probe.level + eps;
  const bias: 'LONG' | 'SHORT' = probe.dir === 'above' ? 'LONG' : 'SHORT';
  const bullets = [
    `${probe.levelKo} ${probe.dir === 'above' ? '상향' : '하향'} 돌파(종가)`,
    hold ? '2봉 종가 유지 — 안착 조건' : still ? '현재 봉 레벨 위·아래 유지 중' : '레벨 재이탈',
    breakVolOk ? '돌파봉 거래량 ≥ 20봉 평균' : '돌파봉 거래량 약함 — 신뢰 보조↓',
    cq === 'strong'
      ? '돌파봉 마감 강함(레인지 끝 마감)'
      : cq === 'weak'
        ? '돌파봉 마감 약함(윗·아랫꼬리 거부)'
        : '돌파봉 마감 중립',
  ];
  if (retest.touched) {
    bullets.push(
      retest.violated
        ? '리테스트 중 레벨 이탈 — 안착 실패'
        : retest.volOk
          ? '리테스트 유지 + 거래량 확인'
          : '리테스트 유지(거래량 보통)'
    );
  }

  if (retest.violated || !still) {
    return { state: 'failed', bias, bullets: [...bullets, '시나리오 약화'] };
  }

  const engineLikeConfirm =
    hold && (!retest.touched || retest.volOk) && breakVolOk && cq !== 'weak';

  if (engineLikeConfirm) return { state: 'confirmed', bias, bullets };
  if (still && (hold || breakVolOk)) {
    return {
      state: 'candidate',
      bias,
      bullets: [...bullets, !breakVolOk ? '확정 전 — 돌파 거래량 보강 필요' : '확정 전 — 2봉 유지·리테스트 확인'],
    };
  }
  return { state: 'watch', bias, bullets };
}

function fromAnalyzeSettlement(analysis: AnalyzeResponse | null | undefined): MonthDeskZoneSettleReaction | null {
  const sz = analysis?.settlementZone;
  if (!sz || sz.state === 'none' || !sz.direction || sz.direction === 'NONE') return null;
  const isL = sz.direction === 'LONG';
  const ok = sz.state === 'confirmed';
  const fail = sz.state === 'failed';
  const cand = sz.state === 'candidate';
  const state: MonthDeskZoneSettleState = ok ? 'confirmed' : fail ? 'failed' : cand ? 'candidate' : 'watch';
  const bias = isL ? 'LONG' : 'SHORT';
  const headlineKo = ok
    ? isL
      ? '상승 확정'
      : '하락 확정'
    : fail
      ? isL
        ? '상승 안착 실패'
        : '하락 안착 실패'
      : isL
        ? '상승 안착 중'
        : '하락 안착 중';
  const pal = isL ? MONTH_DESK_TRAINER.long : MONTH_DESK_TRAINER.short;
  return {
    bias,
    state,
    headlineKo,
    pinLabel: ok ? (isL ? '▲확정' : '▼확정') : fail ? '✗' : isL ? '▲?' : '▼?',
    levelKo: '안착존',
    bullets: [
      `엔진 안착 ${sz.state}${sz.grade ? ` · ${sz.grade}` : ''}`,
      '브레이크 → 2봉 종가 유지 → (선택) 리테스트·리테스트 거래량',
      typeof sz.score === 'number' ? `점수 ${Math.round(sz.score)}` : '',
      '참고용',
    ].filter(Boolean),
    color: pal.labelText,
    bgColor: ok ? (isL ? 'rgba(6,78,59,0.9)' : 'rgba(69,10,10,0.9)') : 'rgba(15,23,42,0.88)',
    borderColor: pal.border,
  };
}

export function assessMonthDeskZoneSettleReaction(input: {
  candles: Candle[];
  pack: OverlayItem[];
  timeframe?: string;
  analysis?: AnalyzeResponse | null;
  scenario?: ClosingEnvelopeFuturesScenario | null;
  settleRow?: TfCloseSettleRow | null;
}): MonthDeskZoneSettleReaction | null {
  const { candles, pack, analysis, scenario, settleRow } = input;
  if (candles.length < 4 || pack.length === 0) return null;

  const fromEngine = fromAnalyzeSettlement(analysis ?? null);
  if (fromEngine?.state === 'confirmed') return fromEngine;

  let best: {
    reaction: MonthDeskZoneSettleReaction;
    score: number;
  } | null = null;

  for (const probe of buildProbes(pack)) {
    const hit = reactionFromProbe(candles, probe);
    if (!hit) continue;
    let score = probe.weight;
    if (hit.state === 'confirmed') score += 40;
    else if (hit.state === 'candidate') score += 18;
    else score -= 25;

    const isL = hit.bias === 'LONG';
    const headlineKo =
      hit.state === 'confirmed'
        ? isL
          ? '상승 확정'
          : '하락 확정'
        : hit.state === 'candidate'
          ? isL
            ? '상승 안착 중'
            : '하락 안착 중'
          : isL
            ? '상승 실패'
            : '하락 실패';
    const pal = isL ? MONTH_DESK_TRAINER.long : MONTH_DESK_TRAINER.short;
    const reaction: MonthDeskZoneSettleReaction = {
      bias: hit.bias,
      state: hit.state,
      headlineKo,
      pinLabel:
        hit.state === 'confirmed'
          ? isL
            ? '▲확정'
            : '▼확정'
          : hit.state === 'failed'
            ? '✗'
            : isL
              ? '▲?'
              : '▼?',
      levelKo: probe.levelKo,
      bullets: [...hit.bullets, '플랜·존 라인 기준(실시간)'],
      color: pal.labelText,
      bgColor:
        hit.state === 'confirmed'
          ? isL
            ? 'rgba(6,78,59,0.9)'
            : 'rgba(69,10,10,0.9)'
          : 'rgba(30,41,59,0.9)',
      borderColor: pal.border,
    };
    if (!best || score > best.score) best = { reaction, score };
  }

  if (best && best.score >= 70) return best.reaction;

  if (scenario?.lastVerdict === '안착' && (scenario.bias === 'LONG' || scenario.bias === 'SHORT')) {
    const isL = scenario.bias === 'LONG';
    const pal = isL ? MONTH_DESK_TRAINER.long : MONTH_DESK_TRAINER.short;
    return {
      bias: scenario.bias,
      state: 'candidate',
      headlineKo: isL ? '상승 안착 중' : '하락 안착 중',
      pinLabel: isL ? '▲안착' : '▼안착',
      levelKo: '마감존',
      bullets: [scenario.summaryKo || '마감 밴드 안착', '참고용'],
      color: pal.caption,
      bgColor: 'rgba(15,23,42,0.9)',
      borderColor: pal.border,
    };
  }

  if (settleRow?.formingVerdict === '안착') {
    const isL = settleRow.confirmedEdge === '롱 유리' || settleRow.formingScore >= 0;
    const bias: 'LONG' | 'SHORT' = isL ? 'LONG' : 'SHORT';
    const pal = isL ? MONTH_DESK_TRAINER.long : MONTH_DESK_TRAINER.short;
    return {
      bias,
      state: 'candidate',
      headlineKo: isL ? '상승 안착 중' : '하락 안착 중',
      pinLabel: isL ? '▲?' : '▼?',
      levelKo: `${settleRow.tfKo} 마감`,
      bullets: settleRow.formingBullets?.slice(0, 2) ?? ['진행 봉 안착', '참고용'],
      color: pal.caption,
      bgColor: 'rgba(15,23,42,0.88)',
      borderColor: pal.border,
    };
  }

  return fromEngine ?? best?.reaction ?? null;
}
