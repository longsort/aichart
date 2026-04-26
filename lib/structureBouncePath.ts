import type { BriefingWavePathResult } from '@/lib/briefingWavePath';
import type { OverlayItem } from '@/types';

/**
 * "밀림 → (지지/저항에서) 반등 감시 → 밀리면 다음 → 목표" 를 한 세트로 설명.
 * 브리핑 3파·OB·TP/SL·무효가와 맞춘다(확정 수익 아님, 시나리오 가이드).
 */

export type StructureBounceStepKind = 'press' | 'reaction' | 'break_next' | 'target' | 'range_low' | 'range_high';

export type StructureBounceStep = {
  order: number;
  kind: StructureBounceStepKind;
  title: string;
  detail: string;
  low: number;
  high: number;
};

export type StructureBouncePath = {
  bias: 'up' | 'down' | 'range';
  /** 분석 보드용 짧은 제목 */
  headline: string;
  /** 한 문단 요약 */
  summaryLine: string;
  steps: StructureBounceStep[];
};

type Ob = { low: number; high: number } | null | undefined;
type Lvl = { price: number } | null | undefined;

function num(s: string | undefined): number {
  const n = parseFloat(String(s ?? ''));
  return Number.isFinite(n) && n > 0 ? n : NaN;
}

function ensureBand(lo: number, high: number): { low: number; high: number } {
  if (lo > high) return { low: high, high: lo };
  if (lo === high) {
    const pad = Math.max(lo * 1.3e-4, 1e-9);
    return { low: lo - pad, high: high + pad };
  }
  return { low: lo, high };
}

/**
 * @param toRatio closeOverlayRange 기준 y 비율 (기존 종가 오버레이와 동일)
 */
export function buildStructureBounceOverlays(
  path: StructureBouncePath,
  toRatio: (p: number) => number
): OverlayItem[] {
  const colors: Record<StructureBounceStepKind, string> = {
    press: 'rgba(251,191,36,0.88)',
    reaction: 'rgba(45,212,191,0.9)',
    break_next: 'rgba(248,113,113,0.85)',
    target: 'rgba(56,189,248,0.92)',
    range_low: 'rgba(129,140,248,0.8)',
    range_high: 'rgba(244,114,182,0.8)',
  };
  const x1 = 0.06;
  const x2 = 0.995;
  const out: OverlayItem[] = [];
  for (const s of path.steps) {
    const c = colors[s.kind] ?? 'rgba(148,163,184,0.85)';
    out.push(
      {
        id: `structure-bounce-${s.order}-lo`,
        kind: 'keyLevel',
        label: `${s.order}. ${s.title} (하)`,
        x1,
        y1: toRatio(s.low),
        x2,
        y2: toRatio(s.low),
        price1: s.low,
        price2: s.low,
        confidence: 70,
        color: c,
        lineDash: '4 3',
        category: 'keyLevel',
        noProject: true,
        lineLabelColor: '#e2e8f0',
      },
      {
        id: `structure-bounce-${s.order}-hi`,
        kind: 'keyLevel',
        label: `${s.title} — ${s.detail.slice(0, 56)}${s.detail.length > 56 ? '…' : ''}`,
        x1: x1 + 0.02,
        y1: toRatio(s.high),
        x2,
        y2: toRatio(s.high),
        price1: s.high,
        price2: s.high,
        confidence: 70,
        color: c,
        lineDash: '4 3',
        category: 'keyLevel',
        noProject: true,
        lineLabelColor: '#f1f5f9',
      }
    );
  }
  return out;
}

export function buildStructureBouncePath(input: {
  currentPrice: number;
  verdict: 'LONG' | 'SHORT' | 'WATCH';
  nearestSupportOb: Ob;
  nearestResistanceOb: Ob;
  supportLevel: Lvl;
  resistanceLevel: Lvl;
  invalidationLevel: Lvl;
  entry: string;
  stopLoss: string;
  targets: string[];
  wavePath: BriefingWavePathResult | null;
}): StructureBouncePath | null {
  const p = input.currentPrice;
  if (!Number.isFinite(p) || p <= 0) return null;
  const tp1 = num((input.targets ?? [])[0]);
  const sl = num(input.stopLoss);
  const sup = input.nearestSupportOb;
  const res = input.nearestResistanceOb;
  const invP = input.invalidationLevel?.price;

  if (input.verdict === 'WATCH' && sup && res) {
    const b1 = ensureBand(sup.low, sup.high);
    const b2 = ensureBand(res.low, res.high);
    const path: StructureBouncePath = {
      bias: 'range',
      headline: '횡보·양쪽 세트 (지지/저항)',
      summaryLine:
        `하단 ${b1.low.toFixed(0)}~${b1.high.toFixed(0)} 은(는) 눌림·반등 감시, 상단 ${b2.low.toFixed(0)}~${b2.high.toFixed(0)} 은(는) 되돌림·거절 감시 구간(참고)입니다. 한쪽이 뚫리면 반대 박스가 "다음 반응"이 될 수 있습니다.`,
      steps: [
        {
          order: 1,
          kind: 'range_low',
          title: '하단·눌림/반등',
          detail: '지지 OB(또는 강한 지지) 쪽 — 롱/반등 시나리오 감시',
          ...b1,
        },
        {
          order: 2,
          kind: 'range_high',
          title: '상단·되돌림/거절',
          detail: '저항 OB(또는 강한 저항) 쪽 — 숏/거절 시나리오 감시',
          ...b2,
        },
      ],
    };
    return path;
  }

  if (input.wavePath) {
    const w = input.wavePath;
    const { preAnchor, w1, w2, w3 } = w;
    if (!w.useShort) {
      const s1 = ensureBand(Math.min(preAnchor, w1), Math.max(preAnchor, w1));
      const s2 = sup
        ? ensureBand(sup.low, sup.high)
        : ensureBand(p * (1 - 0.0011), p * (1 + 0.0009));
      let breakLo = p;
      let breakHi = p;
      if (invP != null && invP < p) {
        breakLo = invP;
        breakHi = invP + p * 0.0004;
      } else if (Number.isFinite(sl) && sl < p) {
        breakLo = sl;
        breakHi = sl + p * 0.0004;
      } else if (sup) {
        breakLo = sup.low * 0.9995;
        breakHi = sup.low;
      } else {
        return null;
      }
      const s3 = ensureBand(breakLo, breakHi);
      const s4 = ensureBand(w3, w3);
      const path: StructureBouncePath = {
        bias: 'up',
        headline: `롱·세트 (${w.tag})`,
        summaryLine: `1) 조정·1파 대역 ${Math.round(s1.low)}~${Math.round(s1.high)} → 2) 지지/반등 감시 ${Math.round(s2.low)}~${Math.round(s2.high)} → 3) 이 ${Math.round(s3.low)} 아래(근처)로 마감·확인되면 전제 약화 → 4) 3파·TP1 방향 ${Math.round(w3)} (브리핑 3파와 동일·참고).`,
        steps: [
          { order: 1, kind: 'press', title: '① 1파·밀림/조정 대역', detail: '급이동 후 첫 눌림(조정) — 브리핑 1파', ...s1 },
          { order: 2, kind: 'reaction', title: '② 반등·지지(OB) 감시', detail: '여기서의 반응(반등)을 보고 3파·진입 퀄리티를 판단', ...s2 },
          { order: 3, kind: 'break_next', title: '③ 밀리면(이탈)·다음', detail: '무효가/손절·지지 이탈 시 "다음 구조"·손절 쪽으로', ...s3 },
          { order: 4, kind: 'target', title: '④ 목표(3파·TP1)', detail: '브리핑 시나리오의 도착·목표(참고)', ...s4 },
        ],
      };
      return path;
    }
    const s1 = ensureBand(Math.min(w1, preAnchor), Math.max(w1, preAnchor));
    const s2 = res
      ? ensureBand(res!.low, res!.high)
      : ensureBand(p * (1 - 0.0009), p * (1 + 0.0011));
    let breakLo = p;
    let breakHi = p;
    if (invP != null && invP > p) {
      breakLo = invP - p * 0.0004;
      breakHi = invP;
    } else if (Number.isFinite(sl) && sl > p) {
      breakLo = sl - p * 0.0004;
      breakHi = sl;
    } else if (res) {
      breakLo = res.high;
      breakHi = res.high * 1.0005;
    } else {
      return null;
    }
    const s3 = ensureBand(breakLo, breakHi);
    const s4 = ensureBand(w3, w3);
    const path: StructureBouncePath = {
      bias: 'down',
      headline: `숏·세트 (${w.tag})`,
      summaryLine: `1) 반등/조정·1파 대역 ${Math.round(s1.low)}~${Math.round(s1.high)} → 2) 저항(OB)·거절 ${Math.round(s2.low)}~${Math.round(s2.high)} → 3) 이 ${Math.round(s3.high)} 위(근처)로 마감·확인되면 전제 약화 → 4) 목표 ${Math.round(w3)} (참고).`,
      steps: [
        { order: 1, kind: 'press', title: '① 1파·밀어올림(반등) 대역', detail: '하락 시나리오의 첫 반등 구간(브리핑 1파)', ...s1 },
        { order: 2, kind: 'reaction', title: '② 저항(OB)에서의 거절·재진입', detail: '다시 눌리는 "반응" 감시', ...s2 },
        { order: 3, kind: 'break_next', title: '③ 밀리면(이탈)·다음', detail: '저항/무효·손절을 올리면 숏·관망 전제 재검토', ...s3 },
        { order: 4, kind: 'target', title: '④ 목표(3파·TP1)', detail: '하방 도착가(참고)', ...s4 },
      ],
    };
    return path;
  }

  if (tp1 == null || !Number.isFinite(tp1)) return null;

  if (input.verdict === 'LONG' && tp1 > p) {
    if (!sup && !input.supportLevel?.price) return null;
    const s2 = sup
      ? ensureBand(sup!.low, sup!.high)
      : ensureBand(
          input.supportLevel!.price * 0.999,
          input.supportLevel!.price * 1.001
        );
    const toward = s2.high;
    const s1 = ensureBand(Math.min(p, toward) - p * 0.001, Math.max(p, toward) + p * 0.0002);
    let s3: { low: number; high: number };
    if (invP != null && invP < p) s3 = ensureBand(invP, invP);
    else if (Number.isFinite(sl) && sl < p) s3 = ensureBand(sl, sl);
    else s3 = ensureBand(s2.low * 0.9995, s2.low);
    const s4 = ensureBand(tp1, tp1);
    return {
      bias: 'up',
      headline: '롱·세트 (TP 기준)',
      summaryLine: `눌림/밀림 대역 → 지지(OB) ${Math.round(s2.low)}~${Math.round(s2.high)} 에서 반등 감시 → ${Math.round(s3.low)} 이하 이탈 시 다음(무효) → 목표 TP1 ${Math.round(tp1)} (참고).`,
      steps: [
        { order: 1, kind: 'press', title: '① 눌림(밀림) 구간', detail: '현재가~지지 쪽으로의 조정·밀림', ...s1 },
        { order: 2, kind: 'reaction', title: '② 1차 반등·지지(OB)', detail: '이 구간에서의 반응(반등)이 핵심', ...s2 },
        { order: 3, kind: 'break_next', title: '③ 밀리면(이탈)·다음', detail: '지지/무효/손절 아래 — 전제·다음 감시', ...s3 },
        { order: 4, kind: 'target', title: '④ 목표(TP1)', detail: '시나리오상 도착(참고)', ...s4 },
      ],
    };
  }

  if (input.verdict === 'SHORT' && tp1 < p) {
    if (!res && !input.resistanceLevel?.price) return null;
    const s2 = res
      ? ensureBand(res!.low, res!.high)
      : ensureBand(
          input.resistanceLevel!.price * 0.999,
          input.resistanceLevel!.price * 1.001
        );
    const toward = s2.low;
    const s1 = ensureBand(Math.min(p, toward) - p * 0.0002, Math.max(p, toward) + p * 0.001);
    let s3: { low: number; high: number };
    if (invP != null && invP > p) s3 = ensureBand(invP, invP);
    else if (Number.isFinite(sl) && sl > p) s3 = ensureBand(sl, sl);
    else if (res) s3 = ensureBand(res.high, res.high * 1.0005);
    else {
      const rh = input.resistanceLevel!.price;
      s3 = ensureBand(rh, rh * 1.0005);
    }
    const s4 = ensureBand(tp1, tp1);
    return {
      bias: 'down',
      headline: '숏·세트 (TP 기준)',
      summaryLine: `반등(밀림) 구간 → 저항(OB) ${Math.round(s2.low)}~${Math.round(s2.high)} 에서 거절·재눌림 감시 → ${Math.round(s3.high)} 이상이면 다음(무효) → TP1 ${Math.round(tp1)} (참고).`,
      steps: [
        { order: 1, kind: 'press', title: '① 반등(밀림) 구간', detail: '현재가~저항 쪽으로의 반등(밀어올림)', ...s1 },
        { order: 2, kind: 'reaction', title: '② 1차 거절·저항(OB)', detail: '이 구간에서의 반응(거절)이 핵심', ...s2 },
        { order: 3, kind: 'break_next', title: '③ 밀리면(이탈)·다음', detail: '저항/무효/손절 위 — 전제·다음 감시', ...s3 },
        { order: 4, kind: 'target', title: '④ 목표(TP1)', detail: '시나리오상 하방(참고)', ...s4 },
      ],
    };
  }

  return null;
}
