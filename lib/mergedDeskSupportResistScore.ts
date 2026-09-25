/**
 * 지지·저항 조건부 강도 — 터치·합류·라이프·Hot/빔·도달을 가중 합성.
 * 확정 승률·수익 보장 아님. 표본 n 표시.
 */
import type { DumpLifeState } from '@/lib/mergedDeskDumpLifeCycle';

export type SrBandKo = '약' | '중' | '강';

export type SupportResistScore = {
  score0to100: number;
  band: SrBandKo;
  /** 지지조건부62% / 저항조건부55% */
  labelKo: string;
  tipKo: string;
  sampleN: number;
  sampleLowTrust: boolean;
  kind: 'support' | 'resist';
};

export type DumpZoneEvidenceChip = string;

export type DumpZoneViewModel = {
  tf: string;
  bandRole: 'floor' | 'ceiling';
  faceRoleKo: string;
  lifeKo: string;
  firmKo?: string;
  active: boolean;
  dim: boolean;
  sr: SupportResistScore | null;
  evidenceChips: DumpZoneEvidenceChip[];
  disclaimerKo: string;
};

const SAMPLE_TRUST_MIN = 12;
const DISCLAIMER_KO = '조건부 표본 · 확정 승률·수익 보장 아님';

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function bandFromScore(score: number, lowTrust: boolean): SrBandKo {
  if (lowTrust && score >= 55) return '중';
  if (score >= 68) return '강';
  if (score >= 42) return '중';
  return '약';
}

function lifeBonus(role: 'floor' | 'ceiling', life?: DumpLifeState | null): number {
  if (!life) return 0;
  if (role === 'floor') {
    if (life === 'CONFIRM_UP') return 100;
    if (life === 'BOUNCE_WATCH') return 62;
    if (life === 'WATCH') return 35;
    if (life === 'CONFIRM_DOWN') return 8;
    return 20;
  }
  if (life === 'CONFIRM_RESIST') return 100;
  if (life === 'RESIST_WATCH') return 62;
  if (life === 'CONFIRM_DOWN') return 55;
  if (life === 'WATCH') return 35;
  if (life === 'BOUNCE_WATCH' || life === 'CONFIRM_UP') return 28;
  return 20;
}

function confluencePart(
  role: 'floor' | 'ceiling',
  bull?: number | null,
  bear?: number | null
): number {
  const b = Number(bull) || 0;
  const s = Number(bear) || 0;
  if (role === 'floor') {
    if (b <= 0 && s <= 0) return 28;
    return clamp((b / Math.max(b + s, 1)) * 100, 0, 100);
  }
  if (b <= 0 && s <= 0) return 28;
  return clamp((s / Math.max(b + s, 1)) * 100, 0, 100);
}

function hotBeamPart(evidenceKo?: string[] | null, role?: 'floor' | 'ceiling'): number {
  const bits = evidenceKo ?? [];
  let score = 30;
  const join = bits.join(' ');
  if (role === 'floor') {
    if (/Hot지지|Hot롱|롱빔|매수|쇼크매수|WAD매수|수요OB/.test(join)) score += 35;
    if (/숏빔|쇼크매도|매도|공급OB|Hot저항/.test(join)) score -= 20;
  } else {
    if (/Hot저항|Hot숏|숏빔|매도|쇼크매도|WAD매도|공급OB/.test(join)) score += 35;
    if (/롱빔|쇼크매수|매수|수요OB|Hot지지/.test(join)) score -= 20;
  }
  return clamp(score, 0, 100);
}

function reachOrInvalidPart(params: {
  role: 'floor' | 'ceiling';
  reachPct?: number | null;
  invalidationDistPct?: number | null;
}): number {
  if (params.role === 'ceiling' && params.reachPct != null && Number.isFinite(params.reachPct)) {
    return clamp(Number(params.reachPct), 0, 100);
  }
  if (params.role === 'floor' && params.reachPct != null && Number.isFinite(params.reachPct)) {
    /** 하단에서 상단 도달% = 반등한도 참고로만 약하게 */
    return clamp(Number(params.reachPct) * 0.85, 0, 100);
  }
  const d = params.invalidationDistPct;
  if (d != null && Number.isFinite(d)) {
    /** 무효까지 멀수록 약간 가점 */
    return clamp(40 + d * 8, 0, 100);
  }
  return 40;
}

/**
 * 기존 조각 가중 합성 → 지지/저항 조건부 점수.
 * touch 0.35 · confluence 0.25 · life 0.20 · Hot/빔 0.15 · reach/무효 0.05
 */
export function computeSupportResistScore(params: {
  role: 'floor' | 'ceiling';
  life?: DumpLifeState | null;
  touchReactionPct?: number | null;
  touchCount?: number | null;
  reachPct?: number | null;
  reachSample?: number | null;
  bullScore?: number | null;
  bearScore?: number | null;
  evidenceKo?: string[] | null;
  invalidationDistPct?: number | null;
}): SupportResistScore {
  const kind = params.role === 'ceiling' ? 'resist' : 'support';
  const touchPct =
    params.touchReactionPct != null && Number.isFinite(params.touchReactionPct)
      ? clamp(Number(params.touchReactionPct), 0, 100)
      : 40;
  const conf = confluencePart(params.role, params.bullScore, params.bearScore);
  const life = lifeBonus(params.role, params.life);
  const hotBeam = hotBeamPart(params.evidenceKo, params.role);
  const reachInv = reachOrInvalidPart({
    role: params.role,
    reachPct: params.reachPct,
    invalidationDistPct: params.invalidationDistPct,
  });

  let raw =
    touchPct * 0.35 + conf * 0.25 + life * 0.2 + hotBeam * 0.15 + reachInv * 0.05;

  const sampleN = Math.max(
    0,
    Number(params.touchCount) || 0,
    Number(params.reachSample) || 0
  );
  const sampleLowTrust = sampleN < SAMPLE_TRUST_MIN;
  if (sampleLowTrust) {
    raw = Math.min(raw, 58);
  }

  const score0to100 = Math.round(clamp(raw, 0, 100));
  const band = bandFromScore(score0to100, sampleLowTrust);
  const kindKo = kind === 'support' ? '지지조건부' : '저항조건부';
  const trustBit = sampleLowTrust ? ' · 통계부족' : '';
  const nBit = sampleN > 0 ? ` · n=${sampleN}` : '';

  return {
    score0to100,
    band,
    labelKo: `${kindKo}${score0to100}%`,
    tipKo: `${kindKo}${score0to100}%(${band})${nBit}${trustBit} · 터치·합류·라이프·Hot/빔 가중 · ${DISCLAIMER_KO}`,
    sampleN,
    sampleLowTrust,
    kind,
  };
}

/** 활성 TF 세트 면용 근거 칩 최대 2개 */
export function pickDumpEvidenceChips(params: {
  evidenceKo?: string[] | null;
  touchLabelKo?: string | null;
  srLabelKo?: string | null;
  active: boolean;
  max?: number;
}): DumpZoneEvidenceChip[] {
  if (!params.active) return [];
  const max = Math.max(1, Math.min(2, params.max ?? 2));
  const out: string[] = [];
  const push = (s: string | null | undefined) => {
    const t = String(s || '')
      .trim()
      .slice(0, 14);
    if (!t) return;
    if (out.some((x) => x === t || x.includes(t) || t.includes(x))) return;
    out.push(t);
  };

  push(params.touchLabelKo);
  for (const raw of params.evidenceKo ?? []) {
    if (out.length >= max) break;
    if (/상단도달|반등확률|반등가능|반등컷/.test(raw)) continue;
    if (/매수|매도|롱빔|숏빔|Hot|쇼크|WAD|OB|존회복|상단윅|종가이탈/.test(raw)) {
      push(raw.replace(/^.*?·/, '').slice(0, 12));
    }
  }
  if (out.length < max && params.srLabelKo) push(params.srLabelKo);
  return out.slice(0, max);
}

export function dumpSrDisclaimerKo(): string {
  return DISCLAIMER_KO;
}

/** 도달 통계 카피 — 반등확률 대신 조건부 도달 */
export function formatReachConditionalKo(pct: number, sample?: number | null): string {
  const n = sample != null && sample > 0 ? `(n=${sample})` : '';
  return `도달조건부${Math.round(pct)}%${n}`;
}
