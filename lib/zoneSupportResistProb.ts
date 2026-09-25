/**
 * 가격존·기관밴드 지지/저항 확률 — 과거 캔들 터치→반응 실측.
 * 가짜 고정%(예: 70) 금지. 표본 부족 시 null.
 * 확정 승률·수익 아님.
 *
 * 차트 라벨: 지지NN%/저항NN% 표시 OFF (수치 과신·혼잡 방지).
 * 내부 계산·게이트(진입 확률 등)는 유지.
 */
import type { Candle } from '@/types';

/** 차트 존 라벨에 지지%/저항% 문구 붙일지 — 사용자 요청으로 OFF */
export const CHART_SHOW_SR_PROB_PCT = false;

export type ZoneSrProbResult = {
  /** 지지 유지(반등) 확률 0–100 · 표본부족 null */
  supportProb: number | null;
  /** 저항 유지(거절) 확률 0–100 · 표본부족 null */
  resistanceProb: number | null;
  samples: number;
  supportTouches: number;
  supportHolds: number;
  resistTouches: number;
  resistHolds: number;
  /** 차트 라벨용 */
  labelKo: string;
  /** confidence 대체용 — 표본 있을 때만 */
  confidence: number | null;
};

const MIN_SAMPLES = 3;
const LOOKAHEAD = 6;

function clampPct(n: number): number {
  return Math.max(1, Math.min(99, Math.round(n)));
}

function bandTouches(
  hi: number,
  lo: number,
  zoneLo: number,
  zoneHi: number
): boolean {
  return lo <= zoneHi && hi >= zoneLo;
}

/**
 * 고정 가격밴드 [zoneLo, zoneHi]에 대한 과거 터치→지지/저항 반응률.
 * - 지지홀드: 터치 후 lookAhead 내 종가가 존 상단 위 또는 존 중앙 이상으로 회복
 * - 저항홀드: 터치 후 lookAhead 내 종가가 존 하단 아래 또는 존 중앙 이하로 거절
 */
export function computePriceBandSrProb(
  candles: Candle[],
  zoneLo: number,
  zoneHi: number,
  opts?: { lookAhead?: number; minSamples?: number; endExclusive?: number }
): ZoneSrProbResult {
  const empty: ZoneSrProbResult = {
    supportProb: null,
    resistanceProb: null,
    samples: 0,
    supportTouches: 0,
    supportHolds: 0,
    resistTouches: 0,
    resistHolds: 0,
    labelKo: '표본부족',
    confidence: null,
  };
  const lo = Math.min(zoneLo, zoneHi);
  const hi = Math.max(zoneLo, zoneHi);
  if (!(hi > lo) || !Array.isArray(candles) || candles.length < 20) return empty;

  const lookAhead = Math.max(3, Math.min(12, opts?.lookAhead ?? LOOKAHEAD));
  const minSamples = Math.max(2, opts?.minSamples ?? MIN_SAMPLES);
  const end =
    opts?.endExclusive != null
      ? Math.max(0, Math.min(candles.length, Math.floor(opts.endExclusive)))
      : candles.length;
  const mid = (lo + hi) / 2;

  let supportTouches = 0;
  let supportHolds = 0;
  let resistTouches = 0;
  let resistHolds = 0;

  for (let i = 2; i < end - lookAhead; i++) {
    const c = candles[i]!;
    const cHi = Number(c.high);
    const cLo = Number(c.low);
    const cClose = Number(c.close);
    if (!(cHi >= cLo) || !(cClose > 0)) continue;
    if (!bandTouches(cHi, cLo, lo, hi)) continue;

    const prev = candles[i - 1]!;
    const prevClose = Number(prev.close);
    const fromAbove = prevClose > mid;
    const fromBelow = prevClose < mid;

    const future = candles.slice(i + 1, i + 1 + lookAhead);
    if (!future.length) continue;

    if (fromAbove || cClose >= mid) {
      /** 위에서 내려와 터치 → 지지 후보 */
      supportTouches += 1;
      const held = future.some((f) => Number(f.close) >= mid || Number(f.close) > hi);
      if (held) supportHolds += 1;
    }
    if (fromBelow || cClose <= mid) {
      /** 아래에서 올려 터치 → 저항 후보 */
      resistTouches += 1;
      const held = future.some((f) => Number(f.close) <= mid || Number(f.close) < lo);
      if (held) resistHolds += 1;
    }
  }

  const samples = supportTouches + resistTouches;
  const supportProb =
    supportTouches >= minSamples
      ? clampPct((supportHolds / supportTouches) * 100)
      : null;
  const resistanceProb =
    resistTouches >= minSamples
      ? clampPct((resistHolds / resistTouches) * 100)
      : null;

  const parts: string[] = [];
  if (supportProb != null) {
    parts.push(`지지${supportProb}%(${supportTouches})`);
  }
  if (resistanceProb != null) {
    parts.push(`저항${resistanceProb}%(${resistTouches})`);
  }
  if (!parts.length) {
    parts.push(
      samples > 0 ? `표본${samples}·미달` : '표본없음'
    );
  }

  const confBase =
    supportProb != null && resistanceProb != null
      ? Math.round((supportProb + resistanceProb) / 2)
      : supportProb ?? resistanceProb;

  return {
    supportProb,
    resistanceProb,
    samples,
    supportTouches,
    supportHolds,
    resistTouches,
    resistHolds,
    labelKo: parts.join(' · '),
    confidence: confBase,
  };
}

/**
 * 기관 SuperTrend 상·하단 라인의 역사적 지지/저항 홀드율.
 * finalLower 터치→지지홀드 · finalUpper 터치→저항홀드.
 */
export function computeInstitutionalBandSrProb(
  candles: Candle[],
  finalLower: number[],
  finalUpper: number[],
  opts?: { lookAhead?: number; minSamples?: number; proximityPct?: number }
): ZoneSrProbResult {
  const empty: ZoneSrProbResult = {
    supportProb: null,
    resistanceProb: null,
    samples: 0,
    supportTouches: 0,
    supportHolds: 0,
    resistTouches: 0,
    resistHolds: 0,
    labelKo: '기관밴드 표본부족',
    confidence: null,
  };
  const n = candles.length;
  if (n < 24 || finalLower.length !== n || finalUpper.length !== n) return empty;

  const lookAhead = Math.max(3, Math.min(12, opts?.lookAhead ?? LOOKAHEAD));
  const minSamples = Math.max(2, opts?.minSamples ?? MIN_SAMPLES);
  const prox = Math.max(0.0004, opts?.proximityPct ?? 0.0012);

  let supportTouches = 0;
  let supportHolds = 0;
  let resistTouches = 0;
  let resistHolds = 0;

  for (let i = 2; i < n - lookAhead; i++) {
    const c = candles[i]!;
    const cHi = Number(c.high);
    const cLo = Number(c.low);
    const fl = Number(finalLower[i]);
    const fu = Number(finalUpper[i]);
    if (!(fl > 0) || !(fu > fl)) continue;

    const padL = fl * prox;
    const padU = fu * prox;
    const touchLower = cLo <= fl + padL && cHi >= fl - padL;
    const touchUpper = cHi >= fu - padU && cLo <= fu + padU;
    if (!touchLower && !touchUpper) continue;

    const future = candles.slice(i + 1, i + 1 + lookAhead);
    if (touchLower) {
      supportTouches += 1;
      /** 하단 지지 홀드: 이후 종가가 하단 위 유지 또는 반등 */
      if (future.some((f) => Number(f.close) > fl + padL * 0.5)) supportHolds += 1;
    }
    if (touchUpper) {
      resistTouches += 1;
      if (future.some((f) => Number(f.close) < fu - padU * 0.5)) resistHolds += 1;
    }
  }

  const samples = supportTouches + resistTouches;
  const supportProb =
    supportTouches >= minSamples
      ? clampPct((supportHolds / supportTouches) * 100)
      : null;
  const resistanceProb =
    resistTouches >= minSamples
      ? clampPct((resistHolds / resistTouches) * 100)
      : null;

  const parts: string[] = [];
  if (supportProb != null) parts.push(`지지${supportProb}%(${supportTouches})`);
  if (resistanceProb != null) parts.push(`저항${resistanceProb}%(${resistTouches})`);
  if (!parts.length) {
    parts.push(samples > 0 ? `기관표본${samples}·미달` : '기관표본없음');
  }

  return {
    supportProb,
    resistanceProb,
    samples,
    supportTouches,
    supportHolds,
    resistTouches,
    resistHolds,
    labelKo: parts.join(' · '),
    confidence:
      supportProb != null && resistanceProb != null
        ? Math.round((supportProb + resistanceProb) / 2)
        : supportProb ?? resistanceProb,
  };
}

/**
 * 현재가 기준 zone 역할:
 * - 가격이 zone 위 → 지지
 * - 가격이 zone 아래 → 저항
 * - zone 안 → 중앙 이상=지지 · 미만=저항
 */
export function resolveSrRoleByPrice(
  price: number,
  zoneLo: number,
  zoneHi: number
): 'support' | 'resist' {
  const lo = Math.min(zoneLo, zoneHi);
  const hi = Math.max(zoneLo, zoneHi);
  const px = Number(price);
  if (!(px > 0) || !(hi > lo)) return 'support';
  if (px > hi) return 'support';
  if (px < lo) return 'resist';
  const mid = (lo + hi) / 2;
  return px >= mid ? 'support' : 'resist';
}

/** 가격 위치에 맞는 한쪽 %만 */
export function pickSrProbForPrice(
  prob: Pick<ZoneSrProbResult, 'supportProb' | 'resistanceProb'>,
  price: number,
  zoneLo: number,
  zoneHi: number
): {
  role: 'support' | 'resist';
  bit: string | null;
  supportProb: number | null;
  resistanceProb: number | null;
} {
  const role = resolveSrRoleByPrice(price, zoneLo, zoneHi);
  if (role === 'support') {
    const p = prob.supportProb;
    return {
      role,
      bit: p != null ? `지지${p}%` : null,
      supportProb: p,
      resistanceProb: null,
    };
  }
  const p = prob.resistanceProb;
  return {
    role,
    bit: p != null ? `저항${p}%` : null,
    supportProb: null,
    resistanceProb: p,
  };
}

function stripSrBits(s: string): string {
  return String(s || '')
    .replace(/\s*·\s*지지조건부\d+(\.\d+)?%/g, '')
    .replace(/\s*·\s*저항조건부\d+(\.\d+)?%/g, '')
    .replace(/\s*지지조건부\d+(\.\d+)?%/g, '')
    .replace(/\s*저항조건부\d+(\.\d+)?%/g, '')
    .replace(/\s*·\s*지지\d+(\.\d+)?%/g, '')
    .replace(/\s*·\s*저항\d+(\.\d+)?%/g, '')
    .replace(/\s*지지\d+(\.\d+)?%/g, '')
    .replace(/\s*저항\d+(\.\d+)?%/g, '')
    .replace(/지지조건부\d+(\.\d+)?%\s*·\s*/g, '')
    .replace(/저항조건부\d+(\.\d+)?%\s*·\s*/g, '')
    .replace(/지지\d+(\.\d+)?%\s*·\s*/g, '')
    .replace(/저항\d+(\.\d+)?%\s*·\s*/g, '')
    .replace(/\s*·\s*·+/g, ' · ')
    .replace(/^\s*·\s*|\s*·\s*$/g, '')
    .trim();
}

/** 오버레이 라벨에 지지/저항% 붙이기 — 차트 표시 OFF면 문구만 제거 */
export function appendSrProbToLabel(
  base: string,
  prob: Pick<ZoneSrProbResult, 'supportProb' | 'resistanceProb' | 'labelKo'>,
  opts?: { price?: number | null; zoneLo?: number | null; zoneHi?: number | null }
): string {
  if (!CHART_SHOW_SR_PROB_PCT) return stripSrBits(base);
  const bits: string[] = [];
  const price = Number(opts?.price);
  const lo = Number(opts?.zoneLo);
  const hi = Number(opts?.zoneHi);
  if (
    Number.isFinite(price) &&
    price > 0 &&
    Number.isFinite(lo) &&
    Number.isFinite(hi) &&
    hi > lo
  ) {
    const picked = pickSrProbForPrice(prob, price, lo, hi);
    if (picked.bit) bits.push(picked.bit);
  } else {
    /** 가격 없으면 더 큰 쪽 하나만 (양옆 동시 표시 금지) */
    const sp = prob.supportProb;
    const rp = prob.resistanceProb;
    if (sp != null && rp != null) {
      bits.push(sp >= rp ? `지지${sp}%` : `저항${rp}%`);
    } else if (sp != null) {
      bits.push(`지지${sp}%`);
    } else if (rp != null) {
      bits.push(`저항${rp}%`);
    }
  }
  if (!bits.length) return stripSrBits(base);
  const core = stripSrBits(base);
  return `${core} · ${bits[0]}`.replace(/^\s*·\s*/, '').trim();
}

function isZoneLikeOverlay(o: {
  kind?: string;
  category?: string;
  price1?: number;
  price2?: number;
}): boolean {
  const k = String(o.kind || '');
  const cat = String(o.category || '');
  if (
    /zone|demand|supply|bpr|ob|fvg|hot/i.test(k) ||
    /zone|Band|bpr|hot|demand|supply|institutional/i.test(cat)
  ) {
    return true;
  }
  return (
    o.price1 != null &&
    o.price2 != null &&
    Number(o.price1) > 0 &&
    Number(o.price2) > 0 &&
    Math.abs(Number(o.price1) - Number(o.price2)) / Math.max(Number(o.price1), 1) < 0.08
  );
}

/**
 * 차트에 올라가는 zone류 오버레이에 실측 지지/저항%를 일괄 부착.
 * CHART_SHOW_SR_PROB_PCT=false면 라벨에서 %만 제거하고 필드는 유지(진입게이트용).
 */
export function enrichZoneOverlaysWithSrProb<
  T extends {
    kind?: string;
    category?: string;
    label?: string;
    zoneFaceBase?: string;
    zoneFaceSignal?: string;
    labelTooltip?: string;
    price1?: number;
    price2?: number;
    confidence?: number;
    supportProb?: number | null;
    resistanceProb?: number | null;
    probSamples?: number | null;
  },
>(candles: Candle[], overlays: T[] | null | undefined): T[] {
  if (!Array.isArray(overlays) || !overlays.length || !candles?.length) {
    return Array.isArray(overlays) ? overlays : [];
  }
  const last = candles[candles.length - 1];
  const mark = Number(last?.close) || 0;
  return overlays.map((o) => {
    if (!isZoneLikeOverlay(o)) {
      if (!CHART_SHOW_SR_PROB_PCT) {
        return {
          ...o,
          label: o.label != null ? stripSrBits(String(o.label)) : o.label,
          zoneFaceBase:
            o.zoneFaceBase != null ? stripSrBits(String(o.zoneFaceBase)) : o.zoneFaceBase,
          zoneFaceSignal:
            o.zoneFaceSignal != null
              ? stripSrBits(String(o.zoneFaceSignal)) || undefined
              : o.zoneFaceSignal,
        };
      }
      return o;
    }
    const p1 = Number(o.price1);
    const p2 = Number(o.price2);
    if (!(p1 > 0) || !(p2 > 0)) return o;
    const lo = Math.min(p1, p2);
    const hi = Math.max(p1, p2);
    if (!(hi > lo)) return o;

    const priceRef = mark > 0 ? mark : (lo + hi) / 2;
    const raw =
      o.supportProb != null || o.resistanceProb != null
        ? {
            supportProb: o.supportProb ?? null,
            resistanceProb: o.resistanceProb ?? null,
            labelKo: '',
            samples: o.probSamples ?? 0,
            confidence: o.confidence ?? null,
          }
        : computePriceBandSrProb(candles, lo, hi);

    if (raw.supportProb == null && raw.resistanceProb == null) {
      if (!CHART_SHOW_SR_PROB_PCT) {
        return {
          ...o,
          label: o.label != null ? stripSrBits(String(o.label)) : o.label,
          zoneFaceBase:
            o.zoneFaceBase != null ? stripSrBits(String(o.zoneFaceBase)) : o.zoneFaceBase,
          zoneFaceSignal:
            o.zoneFaceSignal != null
              ? stripSrBits(String(o.zoneFaceSignal)) || undefined
              : o.zoneFaceSignal,
        };
      }
      return o;
    }

    const picked = pickSrProbForPrice(raw, priceRef, lo, hi);
    const base = stripSrBits(String(o.zoneFaceBase || o.label || '').trim());

    if (!CHART_SHOW_SR_PROB_PCT) {
      return {
        ...o,
        label: base || stripSrBits(String(o.label || '')),
        zoneFaceBase: base || undefined,
        zoneFaceSignal: o.zoneFaceSignal
          ? stripSrBits(String(o.zoneFaceSignal)) || undefined
          : undefined,
        supportProb: picked.supportProb,
        resistanceProb: picked.resistanceProb,
        probSamples: 'samples' in raw ? raw.samples : o.probSamples,
        labelTooltip: `${o.labelTooltip || base} · 차트%숨김 · 확정아님`,
      };
    }

    const labeled = appendSrProbToLabel(base || '존', raw, {
      price: priceRef,
      zoneLo: lo,
      zoneHi: hi,
    });
    const signal = picked.bit || o.zoneFaceSignal;

    return {
      ...o,
      label: labeled,
      zoneFaceBase: labeled,
      zoneFaceSignal: signal,
      supportProb: picked.supportProb,
      resistanceProb: picked.resistanceProb,
      probSamples: 'samples' in raw ? raw.samples : o.probSamples,
      confidence:
        picked.bit != null
          ? Number(String(picked.bit).replace(/\D/g, '')) ||
            (o.confidence != null ? o.confidence : 50)
          : raw.confidence != null
            ? raw.confidence
            : o.confidence != null
              ? o.confidence
              : 50,
      labelTooltip: `${o.labelTooltip || base} · ${picked.bit || ''} · 현재가기준 한쪽 · 확정아님`,
    };
  });
}

/** 라벨 문자열에서 지지%/저항% 제거 (차트 표시용) */
export function stripChartSrProbPct(text: string): string {
  return stripSrBits(text);
}
