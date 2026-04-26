import type { AiZoneSignal } from '@/lib/aiZoneSignal';

export type AiUnifiedLongShort = {
  /** 짧은 한 줄 — 감시 가격대는 `subline` / 그리드로만 표시(중복 방지) */
  headline: string;
  /** 부연: 감시 구간·L/S 등 한 줄(있을 때) */
  subline: string | null;
  /** 0~100, 정합(신뢰·게이트·L/S·단계) — 참고 지표, 수익률이 아님 */
  integrationStrength: number;
  /** 통합 시나리오(주된 편) */
  primary: 'LONG' | 'SHORT' | 'NEUTRAL';
  /** 표시용 방향(롱/숏/관망) */
  verdictLabel: '롱' | '숏' | '관망';
  stage: AiZoneSignal['stage'];
  /** 단계 한글: 의견/준비/확정 */
  stageKorean: string;
  /** aiZoneSignal.confidence (중복 UI 제거용) */
  confidence: number;
  longScore: number;
  shortScore: number;
  /**
   * 메인 감시(메인 박스) — buildAiZoneSignal.zone
   * 없으면 null (관망·자료 부족)
   */
  watch: {
    low: number;
    high: number;
    side: 'LONG' | 'SHORT';
    role: string;
    note: string;
  } | null;
  /** 롱 발판(지지) 참조: OB/핫/엔진 S / 폴백 */
  longLeg: { low: number; high: number; source: string } | null;
  /** 숏 발판(저항) 참조 */
  shortLeg: { low: number; high: number; source: string } | null;
  /** 시나리오 무효 */
  invalidation: { price: number; context: string } | null;
  /**
   * 연속(참고) — “무엇을 넘기면/깨면” 상·하 시나리오
   * 투자 권유가 아닌 **관찰·검증 포인트** 고정
   */
  breaks: {
    forMoreUp: { price: number; label: string } | null;
    forMoreDown: { price: number; label: string } | null;
  };
  /** 2~4개 짧은 태그 — 패널 칩용(구 mixins·긴 문장 대체) */
  metaTags: string[];
  /** @deprecated `metaTags`로 대체; 동일 값 유지(호환) */
  mixins: string[];
  /** 시나리오 A/B 한 줄(브리핑·AI Zone과 중복 제거) */
  scenarioA: string;
  scenarioB: string;
  /** 2~3개만 — 가격/그리드에 이미 든 정보는 제외 */
  insights: string[];
  /** @deprecated `insights`와 동일; 호환 */
  bullets: string[];
};

const fmt = (p: number) => p.toLocaleString(undefined, { maximumFractionDigits: 2 });
const toPrice = (v: unknown, fb: number): number => {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (v && typeof v === 'object' && 'price' in (v as object)) {
    const p = (v as { price?: unknown }).price;
    if (typeof p === 'number' && Number.isFinite(p)) return p;
  }
  return fb;
};

/**
 * AI 분석 모드 전용: `aiZoneSignal` + 엔진 S/R + 롱/숏 기준존 + 돌파 레벨을
 * **하나의 “통합 롱/숏” 뷰**로 묶어 API·패널에 실음.
 */
export function buildAiUnifiedLongShort(input: {
  aiZoneSignal: AiZoneSignal;
  currentPrice: number;
  breakoutLevel?: { price: number; reason?: string } | null;
  supportLevel?: unknown;
  resistanceLevel?: unknown;
  longRef: { low: number; high: number; source: string } | null;
  shortRef: { low: number; high: number; source: string } | null;
  mustBreak?: string;
  mustHold?: string;
  /** 브리핑과 합쳐서 중복 제거 */
  scenarioA?: string;
  scenarioB?: string;
}): AiUnifiedLongShort {
  const a = input.aiZoneSignal;
  const px = input.currentPrice;
  const supP = toPrice(input.supportLevel, px);
  const resP = toPrice(input.resistanceLevel, px);
  const br = input.breakoutLevel;
  const scenarioA = (input.scenarioA ?? a.scenarios?.[0]?.summary ?? '—').trim() || '—';
  const scenarioB = (input.scenarioB ?? a.scenarios?.[1]?.summary ?? '—').trim() || '—';

  const primary: AiUnifiedLongShort['primary'] =
    a.verdict === 'LONG' || a.verdict === 'SHORT' ? a.verdict : 'NEUTRAL';
  const verdictLabel: AiUnifiedLongShort['verdictLabel'] =
    primary === 'LONG' ? '롱' : primary === 'SHORT' ? '숏' : '관망';

  const stageKorean =
    a.stage === 'confirmed' ? '확정' : a.stage === 'prepared' ? '준비' : '의견';
  const c = a.confirmation;
  const gateN = [c.structure, c.zoneReaction, c.mtfAligned, c.invalidationFixed].filter(Boolean).length;
  const lean = Math.abs(a.longScore - a.shortScore);
  /**
   * 정합 점수(0~100, 참고): 신뢰 40% + 확정게이트(4) 35% + L/S 격차 20% + 단계 5%
   * — 수익·승률이 아닌, 엔진 내부 항목이 얼마나 한 방향으로 맞는지의 요약
   */
  const confPart = Math.round(0.4 * a.confidence);
  const gatePart = Math.round((gateN / 4) * 35);
  const leanPart = Math.round(Math.min(100, lean) * 0.2);
  const stagePart = a.stage === 'confirmed' ? 5 : a.stage === 'prepared' ? 2 : 0;
  const integrationStrength = Math.min(100, confPart + gatePart + leanPart + stagePart);

  const watch: AiUnifiedLongShort['watch'] = a.zone
    ? {
        low: a.zone.low,
        high: a.zone.high,
        side: a.zone.side,
        role:
          a.zone.role === 'support_reaction'
            ? '지지 반응'
            : a.zone.role === 'resistance_reaction'
              ? '저항 반응'
              : a.zone.role === 'reentry'
                ? '재진입'
                : a.zone.role === 'breakout_retest'
                  ? '돌파·재시험'
                  : a.zone.role,
        note: `강도 ${a.zone.strengthScore}`,
      }
    : null;

  const inv = a.zone?.invalidation;
  const invalidation: AiUnifiedLongShort['invalidation'] =
    inv != null && Number.isFinite(inv)
      ? {
          price: inv,
          context:
            a.zone?.side === 'LONG'
              ? '이 가격 아래로(종가 기준) 이탈 시 롱 쪽 메인 감시 약화(참고).'
              : a.zone?.side === 'SHORT'
                ? '이 가격 위로(종가 기준) 이탈 시 숏 쪽 메인 감시 약화(참고).'
                : '메인 감시 무효(참고).',
        }
      : null;

  // 상방 연속(참고): 돌파 레벨 > 저항 엔진가 > 숏 박스 상단
  let forMoreUp: { price: number; label: string } | null = null;
  if (br?.price != null && Number.isFinite(br.price)) {
    forMoreUp = { price: br.price, label: `돌파·확장 · ${(br.reason ?? 'level').slice(0, 40)}` };
  } else if (resP > 0 && resP > px * 0.5) {
    forMoreUp = { price: resP, label: '핵심 저항(넘기면 상방 참고)' };
  } else if (input.shortRef && Number.isFinite(input.shortRef.high)) {
    forMoreUp = { price: input.shortRef.high, label: `숏 박스 상·${input.shortRef.source}` };
  }

  // 하방 연속(참고): 엔진 지지 또는 롱 박스 하단
  let forMoreDown: { price: number; label: string } | null = null;
  if (supP > 0 && supP < px * 1.5) {
    forMoreDown = { price: supP, label: '핵심 지지(이탈·참고)' };
  } else if (input.longRef && Number.isFinite(input.longRef.low)) {
    forMoreDown = { price: input.longRef.low, label: `롱 박스 하·${input.longRef.source}` };
  }

  const metaTags = ['엔진+S/R+OB', 'CP+LinReg(차트)', `게이트 ${gateN}/4`];

  const z = a.zone;
  const headline = `${verdictLabel} · ${stageKorean} · 신뢰 ${a.confidence}% · 정합 ${integrationStrength} (참고)`;
  const subline = z
    ? `감시 ${fmt(z.low)}~${fmt(z.high)} · L ${a.longScore} / S ${a.shortScore}`
    : `메인 감시 미고정 · L ${a.longScore} / S ${a.shortScore}`;

  const insights: string[] = [];
  if (input.mustBreak) insights.push(`돌파(참고): ${input.mustBreak.slice(0, 100)}${input.mustBreak.length > 100 ? '…' : ''}`);
  if (input.mustHold) insights.push(`유지(참고): ${input.mustHold.slice(0, 100)}${input.mustHold.length > 100 ? '…' : ''}`);
  for (const r of a.reasons) {
    if (r.includes('엔진 verdict')) continue;
    if (insights.length >= 3) break;
    if (r.trim()) insights.push(r);
  }
  if (insights.length === 0) {
    insights.push(
      gateN >= 3
        ? `정합: 게이트 ${gateN}/4, ${watch ? '메인 감시 구간 고정' : '감시·존을 차트·라벨로 교차 확인(참고)'}.`
        : `준비: 게이트 ${gateN}/4 — 구조·구간·MTF·무효를 차트로 확인(참고).`
    );
  }

  return {
    headline,
    subline,
    integrationStrength,
    primary,
    verdictLabel,
    stage: a.stage,
    stageKorean,
    confidence: a.confidence,
    longScore: a.longScore,
    shortScore: a.shortScore,
    watch: watch
      ? { low: watch.low, high: watch.high, side: watch.side, role: watch.role, note: watch.note }
      : null,
    longLeg: input.longRef,
    shortLeg: input.shortRef,
    invalidation,
    breaks: {
      forMoreUp,
      forMoreDown,
    },
    metaTags,
    mixins: metaTags,
    scenarioA,
    scenarioB,
    insights,
    bullets: insights,
  };
}
