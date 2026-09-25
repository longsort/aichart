/**
 * 도식 ‘지금 자리’ — 분석가 · 대상승/폭락/눌림롱 · 존 · 반등목표.
 * 확정 진입·승률 아님.
 */
import type { Candle } from '@/types';
import type { MergedDeskElliottRead } from '@/lib/mergedDeskElliottWave';
import type { MergedDeskWyckoffRead } from '@/lib/mergedDeskWyckoffCycle';
import type { SchoolSchematicPin } from '@/lib/mergedDeskSchoolSchematicCatalog';
import type { AtlasPulsePriceLine } from '@/lib/monthDeskAtlasPulseDesk';
import { lastAtr, tightenZoneBand, type PriceBand } from '@/lib/mergedDeskSchematicTightZone';

export type SchematicSeatSide = 'long' | 'short' | 'wait';
export type SchematicSeatRole = 'pullback-long' | 'rally-short' | 'run-up' | 'run-down' | 'wait';

export function formatSchematicPrice(p: number): string {
  if (!Number.isFinite(p)) return '—';
  const a = Math.abs(p);
  if (a >= 1000) return p.toLocaleString('en-US', { maximumFractionDigits: 1 });
  if (a >= 1) return p.toLocaleString('en-US', { maximumFractionDigits: 2 });
  return p.toLocaleString('en-US', { maximumFractionDigits: 6 });
}

function band(a: number, b: number): { lo: number; hi: number } {
  return { lo: Math.min(a, b), hi: Math.max(a, b) };
}

function elliottPathPlan(e: MergedDeskElliottRead): {
  role: SchematicSeatRole;
  zoneLow?: number;
  zoneHigh?: number;
  bounceTo?: number;
  dumpTo?: number;
  bounceKo?: string;
} {
  const L = e.levels;
  const w = e.wave;
  const bull = e.bias === 'bullish';
  if (!L) {
    return { role: bull ? (w === 'A' || w === 'C' ? 'run-down' : 'run-up') : w === 'A' || w === 'C' ? 'run-up' : 'run-down' };
  }
  const p0 = L.p0;
  const p1 = L.p1;
  const p2 = L.p2;
  const p3 = L.p3;
  const p4 = L.p4;
  const p5 = L.p5;

  if (bull) {
    if (w === '2') {
      const span = p1 - p0;
      const z = band(p1 - span * 0.618, p1 - span * 0.382);
      return { role: 'pullback-long', zoneLow: z.lo, zoneHigh: z.hi, bounceTo: p1, bounceKo: '반등 목표 · W1고점' };
    }
    if (w === '4' && p3 != null && p2 != null) {
      const span = p3 - p2;
      const z = band(p3 - span * 0.382, p3 - span * 0.236);
      return { role: 'pullback-long', zoneLow: z.lo, zoneHigh: z.hi, bounceTo: p3, bounceKo: '반등 목표 · W3고점' };
    }
    if ((w === 'A' || w === 'C') && p5 != null) {
      const impulse = p5 - p0;
      const fibLo = p5 - impulse * 0.618;
      const fibHi = p5 - impulse * 0.382;
      const a = L.a ?? p5;
      const b = L.b;
      const cEqA = b != null ? b - Math.abs(a - p5) : p5 - Math.abs(a - p5);
      const z = band(Math.min(p2, fibLo, cEqA), Math.max(p2, fibHi));
      const bounce = p4 ?? b ?? p5 - impulse * 0.382;
      return {
        role: 'run-down',
        zoneLow: z.lo,
        zoneHigh: z.hi,
        bounceTo: bounce,
        dumpTo: z.lo,
        bounceKo: p4 != null ? '반등 목표 · W4고점' : '반등 목표 · 0.382~W4권',
      };
    }
    if (w === 'B' && p5 != null && L.a != null) {
      const aSpan = Math.abs(p5 - L.a);
      return {
        role: 'wait',
        bounceTo: p5 - aSpan * 0.382,
        dumpTo: (L.b ?? L.a) - aSpan,
        bounceKo: 'B반등 상한 근사',
      };
    }
    if (w === '3' && p2 != null) {
      const w1 = p1 - p0;
      return { role: 'run-up', bounceTo: p2 + w1 * 1.618, bounceKo: 'W3 확장 1.618×W1' };
    }
    if (w === '5' && p5 != null && p3 != null) {
      const w1 = p1 - p0;
      return { role: 'run-up', bounceTo: (p4 ?? p3) + w1, bounceKo: 'W5≈W1 목표' };
    }
    return { role: 'run-up', bounceTo: p1, bounceKo: '직전 고점' };
  }

  if (w === '2') {
    const span = p0 - p1;
    const z = band(p1 + span * 0.382, p1 + span * 0.618);
    return { role: 'rally-short', zoneLow: z.lo, zoneHigh: z.hi, dumpTo: p1, bounceKo: '반등숏 · W1저점 재하락' };
  }
  if (w === '4' && p3 != null && p2 != null) {
    const span = p2 - p3;
    const z = band(p3 + span * 0.236, p3 + span * 0.382);
    return { role: 'rally-short', zoneLow: z.lo, zoneHigh: z.hi, dumpTo: p3, bounceKo: '반등숏 · W3저점 재하락' };
  }
  if ((w === 'A' || w === 'C') && p5 != null) {
    const impulse = p0 - p5;
    const fibLo = p5 + impulse * 0.382;
    const fibHi = p5 + impulse * 0.618;
    const z = band(Math.min(p2, fibLo), Math.max(p2, fibHi));
    return {
      role: 'run-up',
      zoneLow: z.lo,
      zoneHigh: z.hi,
      dumpTo: p4 ?? p5 + impulse * 0.382,
      bounceKo: '반등 후 재하락 목표',
    };
  }
  return { role: w === 'B' ? 'wait' : 'run-down', dumpTo: p1 };
}

export function resolveSchematicSeatSide(
  pin: Pick<SchoolSchematicPin, 'school' | 'headlineKo' | 'eventLow'>,
  elliott?: MergedDeskElliottRead | null,
  wyckoff?: MergedDeskWyckoffRead | null
): SchematicSeatSide {
  if (/도식 대기|혼조|구름 안/.test(pin.headlineKo)) return 'wait';

  if (pin.school === 'elliott' && elliott) {
    const plan = elliottPathPlan(elliott);
    if (plan.role === 'pullback-long' || plan.role === 'run-up') return 'long';
    if (plan.role === 'rally-short' || plan.role === 'run-down') return 'short';
    return 'wait';
  }

  if (pin.school === 'wyckoff' && wyckoff) {
    if (wyckoff.macro === 'accumulation' || wyckoff.macro === 'markup') return 'long';
    if (wyckoff.macro === 'distribution' || wyckoff.macro === 'markdown') return 'short';
    if (
      wyckoff.event === 'Spring' ||
      wyckoff.event === 'LPS' ||
      wyckoff.event === 'SOS' ||
      wyckoff.event === 'SC'
    ) {
      return 'long';
    }
    if (wyckoff.event === 'UTAD' || wyckoff.event === 'LPSY' || wyckoff.event === 'BC') return 'short';
  }

  if (pin.eventLow) return 'long';
  return 'short';
}

export function schematicSeatKo(side: SchematicSeatSide, role?: SchematicSeatRole): string {
  if (role === 'pullback-long') return '눌림롱 자리';
  if (role === 'rally-short') return '반등숏 자리';
  if (role === 'run-up') return '대상승 자리';
  if (role === 'run-down') return '폭락 자리';
  if (side === 'long') return '대상승 자리';
  if (side === 'short') return '폭락 자리';
  return '대기';
}

export function schematicInvalKo(
  side: SchematicSeatSide,
  spotPrice: number,
  wyckoff?: MergedDeskWyckoffRead | null
): string {
  const px = formatSchematicPrice(spotPrice);
  if (wyckoff && Number.isFinite(wyckoff.support) && Number.isFinite(wyckoff.resist)) {
    if (side === 'long') return `무효화 검토 · WK지지 ${formatSchematicPrice(wyckoff.support)} 이탈`;
    if (side === 'short') return `무효화 검토 · WK저항 ${formatSchematicPrice(wyckoff.resist)} 돌파`;
  }
  if (side === 'long') return `무효화 검토 · 분석가 ${px} 아래 이탈 시 대상승·눌림롱 약화`;
  if (side === 'short') return `무효화 검토 · 분석가 ${px} 위 돌파 시 폭락·반등숏 약화`;
  return '방향 대기 · 이탈 확인 후';
}

export type SchematicSeatPriceCtx = {
  candles?: Candle[];
  buyBand?: PriceBand | null;
  sellBand?: PriceBand | null;
};

export function withSchematicSeatPrices(
  pin: SchoolSchematicPin,
  lastPrice: number,
  elliott?: MergedDeskElliottRead | null,
  wyckoff?: MergedDeskWyckoffRead | null,
  ctx?: SchematicSeatPriceCtx
): SchoolSchematicPin {
  let role: SchematicSeatRole | undefined;
  let zoneLow: number | undefined;
  let zoneHigh: number | undefined;
  let bounceTo: number | undefined;
  let dumpTo: number | undefined;
  let bounceKo: string | undefined;

  if (pin.school === 'elliott' && elliott) {
    const plan = elliottPathPlan(elliott);
    role = plan.role;
    zoneLow = plan.zoneLow;
    zoneHigh = plan.zoneHigh;
    bounceTo = plan.bounceTo;
    dumpTo = plan.dumpTo;
    bounceKo = plan.bounceKo;
  } else if (pin.school === 'wyckoff' && wyckoff) {
    const acc = wyckoff.macro === 'accumulation' || wyckoff.macro === 'markup';
    role = acc
      ? wyckoff.event === 'Spring' || wyckoff.event === 'LPS' || wyckoff.phase === 'B'
        ? 'pullback-long'
        : 'run-up'
      : wyckoff.event === 'UTAD' || wyckoff.event === 'LPSY'
        ? 'rally-short'
        : 'run-down';
    const atr = lastAtr(ctx?.candles) || Math.abs(lastPrice) * 0.004;
    const ev = wyckoff.eventPrice || lastPrice;
    zoneLow = ev - atr * 0.45;
    zoneHigh = ev + atr * 0.45;
    bounceTo = wyckoff.resist;
    dumpTo = wyckoff.support;
    bounceKo = acc ? 'TR저항 · SOS권' : 'TR저항 · UT권';
  }

  const seatSide = resolveSchematicSeatSide(pin, elliott, wyckoff);
  const sellish = role === 'rally-short' || (seatSide === 'short' && role !== 'run-down');
  const tight = tightenZoneBand({
    lo: zoneLow,
    hi: zoneHigh,
    candles: ctx?.candles,
    last: lastPrice,
    side: sellish ? 'sell' : 'buy',
    hot: sellish ? ctx?.sellBand : ctx?.buyBand,
  });
  if (tight) {
    zoneLow = tight.lo;
    zoneHigh = tight.hi;
  }
  let seatKo = schematicSeatKo(seatSide, role);
  if (
    elliott?.bias === 'bullish' &&
    elliott.extension === 'w3' &&
    (elliott.wave === '3' || elliott.wave === '5')
  ) {
    seatKo = '빅롱 자리';
  }
  if (wyckoff?.macro === 'markup' || wyckoff?.event === 'SOS') {
    seatKo = '빅롱 자리';
  }
  return {
    ...pin,
    lastPrice,
    seatSide,
    seatRole: role,
    seatKo,
    invalKo: schematicInvalKo(seatSide, pin.eventPrice, pin.school === 'wyckoff' ? wyckoff : null),
    zoneLow,
    zoneHigh,
    bounceTo,
    dumpTo,
    bounceKo,
  };
}

export function schematicPathPriceLines(pin: SchoolSchematicPin): AtlasPulsePriceLine[] {
  const lines: AtlasPulsePriceLine[] = [];
  if (Number.isFinite(pin.zoneLow) && Number.isFinite(pin.zoneHigh) && pin.zoneLow !== pin.zoneHigh) {
    const pull = pin.seatRole === 'rally-short' || pin.seatSide === 'short';
    lines.push({
      price: pin.zoneHigh!,
      color: pull ? '#f87171' : '#34d399',
      title: pull ? '반등숏존상' : '눌림롱존상',
      lineWidth: 1,
      lineStyle: 'dashed',
      axisLabel: true,
    });
    lines.push({
      price: pin.zoneLow!,
      color: pull ? '#f87171' : '#34d399',
      title: pull ? '반등숏존하' : '눌림롱존하',
      lineWidth: 1,
      lineStyle: 'dashed',
      axisLabel: true,
    });
  }
  if (Number.isFinite(pin.bounceTo)) {
    lines.push({
      price: pin.bounceTo!,
      color: '#fbbf24',
      title: pin.bounceKo?.includes('숏') ? '재하락목표' : '반등목표',
      lineWidth: 1,
      lineStyle: 'solid',
      axisLabel: true,
    });
  }
  if (Number.isFinite(pin.dumpTo) && pin.dumpTo !== pin.bounceTo && pin.dumpTo !== pin.zoneLow) {
    lines.push({
      price: pin.dumpTo!,
      color: '#fb7185',
      title: '폭락목표',
      lineWidth: 1,
      lineStyle: 'dotted',
      axisLabel: true,
    });
  }
  return lines;
}
