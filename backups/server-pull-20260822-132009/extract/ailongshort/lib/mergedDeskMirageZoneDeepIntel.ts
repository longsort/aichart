/**
 * Mirage zone 면 라벨 — 마감·SMC·과거체결밀집·장세맞음 (쉬운 한글, 조건부 참고).
 */
import type { AnalyzeResponse, OverlayItem } from '@/types';
import type { MergedSmcLeadingContext } from '@/lib/mergedAnalysisSmcLeading';
import { isMergedDeskMirageTvZoneOverlay } from '@/lib/mergedAnalysisOverlayIds';
import {
  buildMirageZoneAiFaceLabel,
  extractMirageZoneLifecycleKo,
  inferMirageZoneRole,
  stampMirageZoneIntelOnOverlay,
  type MirageZoneProactiveIntel,
  type ZoneRole,
} from '@/lib/mergedDeskMirageZoneExchangeIntel';
import type { MirageZoneFaceLang } from '@/lib/mergedDeskMirageZoneCompactLabel';

export type MirageZoneSettlementRef = {
  state: 'none' | 'candidate' | 'confirmed' | 'failed';
  direction: 'LONG' | 'SHORT' | 'NONE';
  level: number | null;
  grade?: string;
};

export type MirageZonePathRef = {
  bias: 'up' | 'down' | 'range';
};

export type MirageZoneSmcRef = {
  lastChoch?: {
    price: number;
    bias: 'bullish' | 'bearish';
    tag: string;
    phase: string;
  } | null;
  obs?: Array<{ low: number; high: number; bias: 'bullish' | 'bearish' }>;
};

export type MirageZoneDeepIntelInput = {
  settlement?: MirageZoneSettlementRef | null;
  structurePath?: MirageZonePathRef | null;
  smc?: MirageZoneSmcRef | null;
  whaleMemoryZones?: Array<{ price1: number; price2: number; confidence?: number }>;
};

function zoneOverlap(aBot: number, aTop: number, bBot: number, bTop: number): boolean {
  return Math.min(aTop, bTop) - Math.max(aBot, bBot) > 0;
}

function nearPrice(center: number, price: number, pct = 0.006): boolean {
  if (!(center > 0) || !Number.isFinite(price)) return false;
  return Math.abs(price - center) / center <= pct;
}

/** 1. 마감·안착 */
export function scoreZoneSettlementKo(
  role: ZoneRole,
  zoneTop: number,
  zoneBot: number,
  settlement?: MirageZoneSettlementRef | null
): string | null {
  if (!settlement || settlement.state === 'none' || settlement.level == null) return null;
  const lv = Number(settlement.level);
  if (!Number.isFinite(lv)) return null;
  const inZone = lv >= zoneBot && lv <= zoneTop;
  const center = (zoneTop + zoneBot) / 2;
  if (!inZone && !nearPrice(center, lv, 0.012)) return null;

  const expectBull = role === 'support' || role === 'ob_bull';
  const expectBear = role === 'resistance' || role === 'ob_bear';
  const longSettle = settlement.direction === 'LONG';
  const shortSettle = settlement.direction === 'SHORT';

  if (settlement.state === 'confirmed') {
    if ((expectBull && longSettle) || (expectBear && shortSettle)) return '마감확인';
    if (longSettle || shortSettle) return '마감확인';
    return '마감확인';
  }
  if (settlement.state === 'failed') return '마감깨짐';
  if (settlement.state === 'candidate') return '마감대기';
  return null;
}

/** 2. SMC — 구조전환·오더블럭·유동성 */
export function scoreZoneSmcKo(
  role: ZoneRole,
  zoneTop: number,
  zoneBot: number,
  smc?: MirageZoneSmcRef | null
): string | null {
  if (!smc) return null;
  const center = (zoneTop + zoneBot) / 2;
  const expectBull = role === 'support' || role === 'ob_bull';
  const expectBear = role === 'resistance' || role === 'ob_bear';

  for (const ob of smc.obs ?? []) {
    if (!zoneOverlap(zoneBot, zoneTop, ob.low, ob.high)) continue;
    if (expectBull && ob.bias === 'bullish') return '매수블럭';
    if (expectBear && ob.bias === 'bearish') return '매도블럭';
    return '오더블럭';
  }

  const ch = smc.lastChoch;
  if (ch && (zoneOverlap(zoneBot, zoneTop, ch.price, ch.price) || nearPrice(center, ch.price))) {
    if (ch.tag === 'CHOCH') {
      if (ch.phase === 'confirmed' || ch.phase === 'settling') {
        return ch.bias === 'bullish' ? '구조전환↑' : '구조전환↓';
      }
      if (ch.phase === 'failed') return '구조실패';
      if (ch.phase === 'breakout') return ch.bias === 'bullish' ? '돌파시도↑' : '돌파시도↓';
      return ch.bias === 'bullish' ? '구조바뀜↑' : '구조바뀜↓';
    }
    if (ch.tag === 'BOS') {
      return ch.bias === 'bullish' ? '추세이어↑' : '추세이어↓';
    }
  }

  return null;
}

/** 3. 과거 체결 밀집 (고래메모리 → 쉬운 말) */
export function scoreZoneWhaleMemoryKo(
  zoneTop: number,
  zoneBot: number,
  whaleZones?: Array<{ price1: number; price2: number; confidence?: number }>
): string | null {
  if (!whaleZones?.length) return null;
  const center = (zoneTop + zoneBot) / 2;
  let bestConf = 0;
  let hit = false;
  for (const w of whaleZones) {
    const wBot = Math.min(w.price1, w.price2);
    const wTop = Math.max(w.price1, w.price2);
    const mid = (w.price1 + w.price2) / 2;
    const overlap = zoneOverlap(zoneBot, zoneTop, wBot, wTop) || nearPrice(center, mid, 0.008);
    if (!overlap) continue;
    hit = true;
    bestConf = Math.max(bestConf, Number(w.confidence) || 50);
  }
  if (!hit) return null;
  return bestConf >= 65 ? '예전거래많음' : '거래많았음';
}

/** 4. 장세·시나리오 맞음 (structureBouncePath) */
export function scoreZonePathKo(
  role: ZoneRole,
  structurePath?: MirageZonePathRef | null
): string | null {
  if (!structurePath?.bias) return null;
  const expectBull = role === 'support' || role === 'ob_bull';
  const expectBear = role === 'resistance' || role === 'ob_bear';
  const up = structurePath.bias === 'up';
  const down = structurePath.bias === 'down';

  if (expectBull && up) return '상승장맞음';
  if (expectBear && down) return '하락장맞음';
  if (structurePath.bias === 'range') return '횡보장';
  if (expectBull && down) return '장세안맞음';
  if (expectBear && up) return '장세안맞음';
  return null;
}

export function buildMirageZoneDeepFaceParts(
  role: ZoneRole,
  zoneTop: number,
  zoneBot: number,
  input?: MirageZoneDeepIntelInput | null
): string[] {
  if (!input) return [];
  const out: string[] = [];
  const settle = scoreZoneSettlementKo(role, zoneTop, zoneBot, input.settlement);
  const smc = scoreZoneSmcKo(role, zoneTop, zoneBot, input.smc);
  const whale = scoreZoneWhaleMemoryKo(zoneTop, zoneBot, input.whaleMemoryZones);
  const path = scoreZonePathKo(role, input.structurePath);
  if (settle) out.push(settle);
  if (smc) out.push(smc);
  if (whale) out.push(whale);
  if (path) out.push(path);
  return out.slice(0, 3);
}

export function mirageZoneDeepInputFromAnalysis(
  analysis?: AnalyzeResponse | null,
  smcLeading?: MergedSmcLeadingContext | null,
  whaleMemoryZones?: Array<{ price1: number; price2: number; confidence?: number }>
): MirageZoneDeepIntelInput {
  const sz = analysis?.settlementZone;
  const settlement: MirageZoneSettlementRef | null = sz
    ? {
        state: sz.state,
        direction: sz.direction,
        level: sz.level,
        grade: sz.grade,
      }
    : null;

  const bp = analysis?.structureBouncePath;
  const structurePath: MirageZonePathRef | null = bp?.bias
    ? { bias: bp.bias }
    : null;

  const smc: MirageZoneSmcRef | null = smcLeading
    ? {
        lastChoch: smcLeading.lastChoch
          ? {
              price: smcLeading.lastChoch.price,
              bias: smcLeading.lastChoch.bias,
              tag: smcLeading.lastChoch.tag,
              phase: String(smcLeading.lastChoch.phase),
            }
          : null,
        obs: smcLeading.obs?.slice(0, 6).map((o) => ({
          low: o.low,
          high: o.high,
          bias: o.bias,
        })),
      }
    : null;

  return {
    settlement,
    structurePath,
    smc,
    whaleMemoryZones: whaleMemoryZones?.length ? whaleMemoryZones : undefined,
  };
}

/** 분석·SMC·체결밀집 갱신 시 zone 면 라벨 재조합 */
export function mergeMirageZoneDeepFaceIntoOverlays(
  overlays: OverlayItem[],
  intelById: Record<string, MirageZoneProactiveIntel>,
  deepInput?: MirageZoneDeepIntelInput | null,
  opts?: { faceLang?: MirageZoneFaceLang; compact?: boolean }
): OverlayItem[] {
  if (!deepInput) return overlays;
  return overlays.map((raw) => {
    if (!isMergedDeskMirageTvZoneOverlay(raw) || String(raw.kind) !== 'zone') return raw;
    const id = String(raw.id || '');
    const intel = intelById[id];
    if (!intel) return raw;
    const p1 = Number(raw.price1);
    const p2 = Number(raw.price2);
    if (!Number.isFinite(p1) || !Number.isFinite(p2)) return raw;
    const zoneTop = Math.max(p1, p2);
    const zoneBot = Math.min(p1, p2);
    const role = inferMirageZoneRole(raw);
    const deepParts = buildMirageZoneDeepFaceParts(role, zoneTop, zoneBot, deepInput);
    if (!deepParts.length && !intel.deepFaceKo?.length) return raw;
    const mergedParts = deepParts.length ? deepParts : intel.deepFaceKo ?? [];
    const intel2: MirageZoneProactiveIntel = {
      ...intel,
      deepFaceKo: mergedParts,
      tagKo: buildMirageZoneAiFaceLabel(role, intel, { deepParts: mergedParts }),
    };
    return stampMirageZoneIntelOnOverlay(raw, role, intel2, {
      deepParts: mergedParts,
      faceLang: opts?.faceLang ?? 'ko',
      compact: opts?.compact !== false,
      priorTooltip: String(raw.labelTooltip || '').trim() || undefined,
    });
  });
}
