/**
 * TargetEngine — TP1/TP2/TP3 + reasons. riskEngine 재사용.
 * PHASE 10: 유동성/POC/HTF/CORE 우선 · 퍼센트 단독 타깃 금지.
 * E/SL/TP는 차트 createPriceLine 전폭 (제품 규칙).
 */
import type { Eagle1RiskPlan } from './riskEngine';

export type TargetLevel = {
  id: 'TP1' | 'TP2' | 'TP3';
  price: number | null;
  reason: string;
};

export type TargetStructureAnchors = {
  direction: 'LONG' | 'SHORT' | null;
  entryMid: number | null;
  poc?: number | null;
  hvn?: number | null;
  liqHigh?: number | null;
  liqLow?: number | null;
  coreSupportMid?: number | null;
  coreResistMid?: number | null;
};

export type TargetEngineReport = {
  levels: TargetLevel[];
  netRrTp1: number | null;
  rrGate: Eagle1RiskPlan['rrGate'];
  note: string;
  usedStructureAnchors: boolean;
};

function isPercentOnlyReason(reason: string): boolean {
  return /^[+\-]?\d+(\.\d+)?%$/.test(String(reason || '').trim());
}

function pickAbove(entry: number, candidates: Array<number | null | undefined>): number | null {
  const ok = candidates
    .map((c) => (c != null && Number.isFinite(c) ? Number(c) : null))
    .filter((c): c is number => c != null && c > entry)
    .sort((a, b) => a - b);
  return ok[0] ?? null;
}

function pickBelow(entry: number, candidates: Array<number | null | undefined>): number | null {
  const ok = candidates
    .map((c) => (c != null && Number.isFinite(c) ? Number(c) : null))
    .filter((c): c is number => c != null && c < entry)
    .sort((a, b) => b - a);
  return ok[0] ?? null;
}

/**
 * 퍼센트 단독 reason이면 CORE/POC/유동성 앵커로 교체.
 */
export function runTargetEngine(params: {
  risk: Eagle1RiskPlan | null | undefined;
  anchors?: TargetStructureAnchors | null;
}): TargetEngineReport {
  const risk = params.risk;
  if (!risk) {
    return {
      levels: [
        { id: 'TP1', price: null, reason: '데이터 없음' },
        { id: 'TP2', price: null, reason: '데이터 없음' },
        { id: 'TP3', price: null, reason: '데이터 없음' },
      ],
      netRrTp1: null,
      rrGate: 'none',
      note: '데이터 없음',
      usedStructureAnchors: false,
    };
  }

  let tp1 = risk.tp1;
  let tp1Reason = risk.tp1Reason;
  let tp2 = risk.tp2;
  let tp2Reason = risk.tp2Reason;
  let tp3 = risk.tp3;
  let tp3Reason = risk.tp3Reason;
  let usedStructureAnchors = false;

  const a = params.anchors;
  const entry = a?.entryMid;
  const dir = a?.direction ?? risk.direction;
  if (a && entry != null && Number.isFinite(entry) && (dir === 'LONG' || dir === 'SHORT')) {
    if (dir === 'LONG') {
      const s1 = pickAbove(entry, [a.poc, a.coreResistMid, a.hvn]);
      const s2 = pickAbove(entry, [a.liqHigh, a.hvn, a.coreResistMid]);
      const s3 = pickAbove(s2 ?? entry, [a.liqHigh != null ? a.liqHigh * 1.0 : null, a.coreResistMid]);
      if (s1 != null && (tp1 == null || isPercentOnlyReason(tp1Reason) || /ATR/i.test(tp1Reason))) {
        tp1 = s1;
        tp1Reason = a.poc === s1 ? '가까운 최다거래가격' : a.coreResistMid === s1 ? 'CORE 저항' : '구조 목표';
        usedStructureAnchors = true;
      }
      if (s2 != null && (tp2 == null || isPercentOnlyReason(tp2Reason) || /ATR/i.test(tp2Reason))) {
        tp2 = s2;
        tp2Reason = a.liqHigh === s2 ? '위쪽 유동성/스윙고점' : '다음 구조 목표';
        usedStructureAnchors = true;
      }
      if (s3 != null && s3 > (tp2 ?? entry) && (tp3 == null || isPercentOnlyReason(tp3Reason))) {
        tp3 = s3;
        tp3Reason = '확장 유동성/HTF';
        usedStructureAnchors = true;
      }
    } else {
      const s1 = pickBelow(entry, [a.poc, a.coreSupportMid, a.hvn]);
      const s2 = pickBelow(entry, [a.liqLow, a.hvn, a.coreSupportMid]);
      const s3 = pickBelow(s2 ?? entry, [a.liqLow, a.coreSupportMid]);
      if (s1 != null && (tp1 == null || isPercentOnlyReason(tp1Reason) || /ATR/i.test(tp1Reason))) {
        tp1 = s1;
        tp1Reason = a.poc === s1 ? '가까운 최다거래가격' : a.coreSupportMid === s1 ? 'CORE 지지' : '구조 목표';
        usedStructureAnchors = true;
      }
      if (s2 != null && (tp2 == null || isPercentOnlyReason(tp2Reason) || /ATR/i.test(tp2Reason))) {
        tp2 = s2;
        tp2Reason = a.liqLow === s2 ? '아래쪽 유동성/스윙저점' : '다음 구조 목표';
        usedStructureAnchors = true;
      }
      if (s3 != null && s3 < (tp2 ?? entry) && (tp3 == null || isPercentOnlyReason(tp3Reason))) {
        tp3 = s3;
        tp3Reason = '확장 유동성/HTF';
        usedStructureAnchors = true;
      }
    }
  }

  if (isPercentOnlyReason(tp1Reason)) {
    tp1 = null;
    tp1Reason = '퍼센트 타깃 거부 · 구조 앵커 필요';
  }

  return {
    levels: [
      { id: 'TP1', price: tp1, reason: tp1Reason },
      { id: 'TP2', price: tp2, reason: tp2Reason },
      { id: 'TP3', price: tp3, reason: tp3Reason },
    ],
    netRrTp1: risk.netRrTp1,
    rrGate: risk.rrGate,
    note:
      risk.netRrTp1 != null
        ? `순RR ${risk.netRrTp1.toFixed(2)} · ${risk.rrGate}${usedStructureAnchors ? ' · 구조앵커' : ''}`
        : '통계 부족 또는 RR 없음',
    usedStructureAnchors,
  };
}
