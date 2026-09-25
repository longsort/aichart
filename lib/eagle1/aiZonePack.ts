/**
 * Eagle1 AI ZONE v2 — unified · hotzone · reaction · plan · confluence를 하나로 묶음.
 * 차트=결정요약 · HUD=근거·표본. 확정 수익 표현 금지.
 */
import type { AnalyzeResponse, Candle, OverlayItem } from '@/types';
import type { MergedDeskHotZoneEntry, MergedDeskHotZoneEntryPack } from '@/lib/mergedDeskHotZoneEntry';
import type { AtlasPulsePriceLine } from '@/lib/monthDeskAtlasPulseDesk';
import type { Eagle1MainPlan } from './signalEngine';
import type { UnifiedZoneCard, UnifiedZoneDesk } from './unifiedZoneDesk';
import type { CombinationReport } from './combinationEngine';
import type { ZoneReaction } from './zoneReaction';
import type { ZoneEngineResult } from './zoneEngine';
import type { StructureSnapshot } from './structureEngine';
import type { Eagle1SmartPath } from './smartPath';
import { classifyBandReaction, ZONE_REACTION_KO, type ZoneReactionKind } from './zoneReaction';
import { formatSamplePct } from './noFakeNumbers';
import { EAGLE1_MIN_STAT_SAMPLE } from './noFakeNumbers';
import { formatPriceCompact } from './chartUx';
import { buildStructureDeskOverlays } from './structureDeskDraw';
import { attachFunctionalOverlayLabel } from './chartUx';
import { strengthenUnifiedDeskTradePlan } from '@/lib/mergedDeskUnifiedTradeRails';
import { loadSettings } from '@/lib/settings';

export type Eagle1AiZoneEvidence = {
  label: string;
  tone?: 'positive' | 'negative' | 'neutral' | 'accent';
};

export type Eagle1AiZoneSlot = {
  side: 'support' | 'resist' | 'entry';
  role: 'active' | 'ghost';
  titleKo: string;
  lower: number;
  upper: number;
  mid: number;
  setupScore: number | null;
  sampleN: number;
  holdPct: number | null;
  sources: string[];
  gradeKo: string | null;
  reactionKo: string | null;
  clusterId: string;
  /** 종가·반응 기반 실시간 지지/저항 가능도(0–100) — 표본 혼합 추정 */
  liveHoldPct?: number | null;
};

export type Eagle1AiZoneExecution = {
  direction: 'LONG' | 'SHORT' | null;
  entry: number | null;
  sl: number | null;
  tp1: number | null;
  tp2: number | null;
  tp3: number | null;
};

export type Eagle1AiZonePack = {
  setupScore: number | null;
  sampleN: number;
  longPct: number | null;
  shortPct: number | null;
  lifecycleKo: [string, string, string];
  activeSupport: Eagle1AiZoneSlot | null;
  ghostResist: Eagle1AiZoneSlot | null;
  entry: Eagle1AiZoneSlot | null;
  evidence: Eagle1AiZoneEvidence[];
  execution: Eagle1AiZoneExecution;
  footerKo: string;
  /** 클릭 카드 — 겹친 분석 라벨 */
  overlapKo: string[];
  /** confluence 후보 (지지·저항·Hot) */
  candidates: Eagle1AiZoneSlot[];
};

export type Eagle1AiZoneClickDetail = {
  zoneId: string;
  titleKo: string;
  sideKo: string;
  overlaps: string[];
  evidence: Eagle1AiZoneEvidence[];
  holdPct: number | null;
  sampleN: number;
  setupScore: number | null;
  longPct: number | null;
  shortPct: number | null;
  spotFrom: number | null;
  spotTarget: number | null;
  spotMovePct: number | null;
  spotMoveLabelKo: string;
  execution: Eagle1AiZoneExecution;
  invalidationKo: string;
  disclaimerKo: string;
};

type ZoneCandidate = {
  side: 'support' | 'resist';
  lower: number;
  upper: number;
  score: number;
  setupScore: number | null;
  sampleN: number;
  holdPct: number | null;
  sources: string[];
  gradeKo: string | null;
  reactionKo: string | null;
  clusterId: string;
  titleKo: string;
};

function asPlan(raw: unknown): Eagle1MainPlan | null {
  if (!raw || typeof raw !== 'object') return null;
  return raw as Eagle1MainPlan;
}

function asUnifiedDesk(raw: unknown): UnifiedZoneDesk | null {
  if (!raw || typeof raw !== 'object') return null;
  const u = raw as UnifiedZoneDesk;
  if (!Array.isArray(u.support) || !Array.isArray(u.resist)) return null;
  return u;
}

function asCombination(raw: unknown): CombinationReport | null {
  if (!raw || typeof raw !== 'object') return null;
  return raw as CombinationReport;
}

function asReaction(raw: unknown): ZoneReaction | null {
  if (!raw || typeof raw !== 'object') return null;
  return raw as ZoneReaction;
}

function asStructure(raw: unknown): StructureSnapshot | null {
  if (!raw || typeof raw !== 'object') return null;
  const s = raw as StructureSnapshot;
  if (!Array.isArray(s.events)) return null;
  return s;
}

function asZones(raw: unknown): ZoneEngineResult | null {
  if (!raw || typeof raw !== 'object') return null;
  return raw as ZoneEngineResult;
}

function asSmartPath(raw: unknown): Eagle1SmartPath | null {
  if (!raw || typeof raw !== 'object') return null;
  return raw as Eagle1SmartPath;
}

function asHistoricalSample(raw: unknown): number {
  if (!raw || typeof raw !== 'object') return 0;
  const n = (raw as { totalSample?: number }).totalSample;
  return n != null && Number.isFinite(n) ? n : 0;
}

function hudSetupScore(hud: AnalyzeResponse['eagle1Hud']): number | null {
  if (!hud || typeof hud !== 'object') return null;
  const sc = (hud as { scoreCalibration?: { setupScore?: number } }).scoreCalibration?.setupScore;
  return sc != null && Number.isFinite(sc) ? sc : null;
}

function clampPct(n: number | null | undefined): number | null {
  if (n == null || !Number.isFinite(n)) return null;
  if (n <= 1.05) return Math.round(Math.max(0, Math.min(100, n * 100)));
  return Math.round(Math.max(0, Math.min(100, n)));
}

function scoreUnifiedCard(card: UnifiedZoneCard, plan: Eagle1MainPlan | null): number {
  let s = 0;
  if (card.statLabel === 'ok') s += 120;
  else if (card.statLabel === '통계 부족') s += 35;
  if (card.holdProbability != null && Number.isFinite(card.holdProbability)) {
    s += card.holdProbability * 90;
  }
  s += Math.min(Math.max(card.sampleSize, 0), 120) * 0.35;
  s += Math.min(card.testCount, 20) * 2;
  if (plan?.direction === 'LONG' && card.side === 'support') s += 30;
  if (plan?.direction === 'SHORT' && card.side === 'resist') s += 30;
  if (card.sources.includes('ob') || card.sources.includes('fvg')) s += 12;
  if (card.sources.includes('poc')) s += 10;
  return s;
}

function cardPassesGate(card: UnifiedZoneCard): boolean {
  if (card.statLabel === 'ok') return true;
  if (card.holdProbability != null && card.sampleSize >= EAGLE1_MIN_STAT_SAMPLE) return true;
  if (card.sampleSize >= EAGLE1_MIN_STAT_SAMPLE && card.testCount >= 2) return true;
  return card.sampleSize >= 12 && card.holdProbability != null;
}

function candidateFromUnified(card: UnifiedZoneCard, plan: Eagle1MainPlan | null): ZoneCandidate {
  const holdPct =
    card.holdProbability != null && Number.isFinite(card.holdProbability)
      ? clampPct(card.holdProbability)
      : null;
  return {
    side: card.side,
    lower: Math.min(card.lower, card.upper),
    upper: Math.max(card.lower, card.upper),
    score: scoreUnifiedCard(card, plan),
    setupScore: card.statLabel === 'ok' ? Math.round(60 + (holdPct ?? 40) * 0.35) : null,
    sampleN: card.sampleSize,
    holdPct,
    sources: card.sourceLabels.slice(0, 4),
    gradeKo: card.statLabel === 'ok' ? '검증 표본' : card.statLabel,
    reactionKo: null,
    clusterId: card.clusterId,
    titleKo: card.side === 'support' ? 'AI 지지' : 'AI 저항',
  };
}

/** 선물 — ATR·가격% 상한으로 zone 높이 캡 (과대 밴드·청산 리스크 방지) */
function estimateAtr(candles: Candle[], period = 14): number {
  if (candles.length < 2) return 0;
  const slice = candles.slice(-Math.min(candles.length, period + 1));
  let sum = 0;
  let n = 0;
  for (let i = 1; i < slice.length; i++) {
    const prev = slice[i - 1]!;
    const cur = slice[i]!;
    const tr = Math.max(
      cur.high - cur.low,
      Math.abs(cur.high - prev.close),
      Math.abs(cur.low - prev.close)
    );
    sum += tr;
    n++;
  }
  const last = slice[slice.length - 1]!;
  return n > 0 ? sum / n : last.close * 0.004;
}

function maxFuturesZoneSpan(mid: number, candles: Candle[], kind: 'support' | 'resist' | 'entry'): number {
  if (!(mid > 0)) return 0;
  const atr = estimateAtr(candles);
  const byAtr = atr > 0 ? atr * (kind === 'entry' ? 0.5 : 0.3) : mid * 0.003;
  const byPct = mid * (kind === 'entry' ? 0.0045 : 0.0026);
  const minSpan = mid * 0.00028;
  return Math.max(minSpan, Math.min(byAtr, byPct));
}

function tightenZoneBounds(
  lower: number,
  upper: number,
  candles: Candle[],
  kind: 'support' | 'resist' | 'entry'
): { lower: number; upper: number } {
  const lo = Math.min(lower, upper);
  const hi = Math.max(lower, upper);
  const mid = (lo + hi) / 2;
  if (!(mid > 0)) return { lower: lo, upper: hi };
  const maxSpan = maxFuturesZoneSpan(mid, candles, kind);
  const span = hi - lo;
  if (span <= maxSpan) return { lower: lo, upper: hi };
  const half = maxSpan / 2;
  return { lower: mid - half, upper: mid + half };
}

function isRelevantZoneCandidate(c: ZoneCandidate, refPrice: number, candles: Candle[]): boolean {
  if (!(refPrice > 0)) return true;
  const atr = estimateAtr(candles) || refPrice * 0.004;
  const mid = (c.lower + c.upper) / 2;
  const distPct = Math.abs(mid - refPrice) / refPrice;
  if (distPct > 0.042) return false;
  if (c.side === 'support') {
    /** zone 전체가 캔들 위 — 지지 아님 */
    if (c.lower > refPrice + atr * 0.15) return false;
    /** 종가가 zone 하단 아래 — 이미 이탈 */
    if (refPrice < c.lower - atr * 0.06) return false;
    /** zone이 너무 아래 — 당장 테스트 불가 */
    if (c.upper < refPrice - atr * 1.4) return false;
  }
  if (c.side === 'resist') {
    if (c.upper < refPrice - atr * 0.15) return false;
    if (refPrice > c.upper + atr * 0.06) return false;
    if (c.lower > refPrice + atr * 1.4) return false;
  }
  return true;
}

const REACTION_HOLD_PRIOR: Record<ZoneReactionKind, number> = {
  NONE: 36,
  APPROACH: 42,
  TOUCH: 50,
  HOLD: 66,
  REJECT: 30,
  RETEST: 54,
  RECLAIM: 60,
  LOST: 8,
  BREAK_ATTEMPT: 24,
};

function isSlotInvalidated(slot: Eagle1AiZoneSlot, candles: Candle[]): boolean {
  const last = candles[candles.length - 1];
  if (!last) return false;
  const atr = estimateAtr(candles) || slot.mid * 0.004;
  const pad = Math.min(atr * 0.08, slot.mid * 0.00018);
  if (slot.side === 'support') return last.close < slot.lower - pad;
  if (slot.side === 'resist') return last.close > slot.upper + pad;
  return false;
}

function isZoneEntirelyWrongSide(
  slot: Eagle1AiZoneSlot,
  refPrice: number,
  candles: Candle[]
): boolean {
  const atr = estimateAtr(candles) || refPrice * 0.004;
  if (slot.side === 'support') return slot.lower > refPrice + atr * 0.12;
  if (slot.side === 'resist') return slot.upper < refPrice - atr * 0.12;
  return false;
}

function snapBoundsToPriceTouch(
  lower: number,
  upper: number,
  side: 'support' | 'resist' | 'entry',
  candles: Candle[]
): { lower: number; upper: number } {
  const last = candles[candles.length - 1];
  if (!last) return { lower, upper };
  const mid = (lower + upper) / 2;
  const atr = estimateAtr(candles) || mid * 0.004;
  const maxSpan = maxFuturesZoneSpan(mid, candles, side);
  let anchor = side === 'resist' ? upper : lower;
  if (side === 'support') {
    if (last.low <= upper + atr * 0.05 && last.low >= lower - atr * 0.35) {
      anchor = Math.min(last.low, upper);
    } else if (last.close >= lower && last.close <= upper) {
      anchor = last.close;
    } else if (last.close > upper && last.close - upper <= atr * 0.55) {
      anchor = upper;
    }
  } else if (side === 'resist') {
    if (last.high >= lower - atr * 0.05 && last.high <= upper + atr * 0.35) {
      anchor = Math.max(last.high, lower);
    } else if (last.close >= lower && last.close <= upper) {
      anchor = last.close;
    } else if (last.close < lower && lower - last.close <= atr * 0.55) {
      anchor = lower;
    }
  } else {
    anchor = last.close;
  }
  const half = Math.min(maxSpan / 2, Math.max(maxSpan * 0.42, atr * 0.18));
  return { lower: anchor - half, upper: anchor + half };
}

function computeLiveHoldState(
  slot: Eagle1AiZoneSlot,
  candles: Candle[]
): { liveHoldPct: number | null; reactionKo: string; invalidated: boolean } {
  if (isSlotInvalidated(slot, candles)) {
    return { liveHoldPct: null, reactionKo: '이탈', invalidated: true };
  }
  const bias = slot.side === 'resist' ? 'bearish' : 'bullish';
  const { kind } = classifyBandReaction({
    candles,
    lower: slot.lower,
    upper: slot.upper,
    bias,
  });
  const reactionKo = ZONE_REACTION_KO[kind] || '접근';
  let live = REACTION_HOLD_PRIOR[kind] ?? 38;
  if (slot.holdPct != null && slot.sampleN >= EAGLE1_MIN_STAT_SAMPLE) {
    live = Math.round(slot.holdPct * 0.58 + live * 0.42);
  } else if (slot.setupScore != null) {
    live = Math.round(live * 0.62 + Math.min(slot.setupScore, 88) * 0.38);
  }
  live = Math.max(6, Math.min(90, live));
  return { liveHoldPct: live, reactionKo, invalidated: false };
}

function enrichSlotWithLiveState(
  slot: Eagle1AiZoneSlot,
  candles: Candle[],
  refPrice: number
): Eagle1AiZoneSlot | null {
  if (isZoneEntirelyWrongSide(slot, refPrice, candles)) return null;
  const kind = slot.side === 'entry' ? 'entry' : slot.side;
  const snapped = snapBoundsToPriceTouch(slot.lower, slot.upper, kind, candles);
  const bounds = tightenZoneBounds(snapped.lower, snapped.upper, candles, kind);
  const draft: Eagle1AiZoneSlot = {
    ...slot,
    lower: bounds.lower,
    upper: bounds.upper,
    mid: (bounds.lower + bounds.upper) / 2,
  };
  const live = computeLiveHoldState(draft, candles);
  if (live.invalidated) return null;
  const role =
    live.liveHoldPct != null && live.liveHoldPct < 26 && slot.side !== 'entry' ? 'ghost' : slot.role;
  return {
    ...draft,
    liveHoldPct: live.liveHoldPct,
    reactionKo: live.reactionKo,
    role,
  };
}

function candidateActionScore(c: ZoneCandidate, refPrice: number, candles: Candle[]): number {
  let s = c.score;
  const atr = estimateAtr(candles) || refPrice * 0.004;
  if (c.side === 'support') {
    if (refPrice < c.lower - atr * 0.06) return -9999;
    if (c.lower > refPrice + atr * 0.12) return -9999;
    if (refPrice >= c.lower && refPrice <= c.upper) s += 40;
    else if (refPrice > c.upper && refPrice - c.upper <= atr * 0.55) s += 22;
    s -= Math.min(40, Math.abs(refPrice - (c.upper + c.lower) / 2) / atr * 5);
  } else {
    if (refPrice > c.upper + atr * 0.06) return -9999;
    if (c.upper < refPrice - atr * 0.12) return -9999;
    if (refPrice >= c.lower && refPrice <= c.upper) s += 40;
    else if (refPrice < c.lower && c.lower - refPrice <= atr * 0.55) s += 22;
    s -= Math.min(40, Math.abs(refPrice - (c.upper + c.lower) / 2) / atr * 5);
  }
  return s;
}

function aiZoneEntryDirKo(slot: Pick<Eagle1AiZoneSlot, 'titleKo' | 'side'>): '롱' | '숏' {
  const t = String(slot.titleKo || '');
  if (/숏|SHORT/i.test(t)) return '숏';
  if (/롱|LONG/i.test(t)) return '롱';
  return '롱';
}

/** 진입 슬롯 → 롱진입 / 숏진입 (방향 모호한 「진입」 금지) */
function aiZoneSideLabelKo(slot: Eagle1AiZoneSlot): string {
  if (slot.side === 'resist') {
    return slot.role === 'ghost' ? '다음저항' : '숏구간';
  }
  if (slot.side === 'entry') {
    return `${aiZoneEntryDirKo(slot)}진입`;
  }
  return slot.role === 'ghost' ? '다음지지' : '롱구간';
}

export function formatAiZoneSlotLabelKo(slot: Eagle1AiZoneSlot): string {
  const pct = slot.liveHoldPct ?? slot.holdPct;
  const sideKo = aiZoneSideLabelKo(slot);
  if (pct != null && Number.isFinite(pct)) {
    const est = slot.sampleN >= EAGLE1_MIN_STAT_SAMPLE ? '' : '추정';
    /** 예: 롱진입추정 60% · 숏진입 72% */
    return est
      ? `${sideKo}추정 ${Math.round(pct)}%`
      : `${sideKo} ${Math.round(pct)}%`;
  }
  return sideKo === '롱구간' ||
    sideKo === '다음지지' ||
    sideKo === '숏구간' ||
    sideKo === '다음저항' ||
    sideKo.endsWith('진입')
    ? sideKo
    : slot.titleKo;
}

function aiZoneFillAlpha(base: number): number {
  try {
    const pct = Number(loadSettings().chartMergedDeskRbFillOpacity);
    if (!Number.isFinite(pct)) return base;
    /** 0=거의 무색 · 사용자 농도로 AI ZONE 면도 동기 */
    const scale = Math.max(0, Math.min(1, pct / 28));
    return Math.max(0.02, Math.min(0.42, base * (0.35 + scale * 0.9)));
  } catch {
    return base;
  }
}

function parseGradeScore(label: string): number {
  if (/초강력|ultra/i.test(label)) return 95;
  if (/★\s*강|강반등|강하락|강저항/i.test(label)) return 78;
  if (/★\s*중|중반등|중하락|중저항/i.test(label)) return 62;
  if (/★\s*약|약반등|약하락|약저항|반응/i.test(label)) return 48;
  return 55;
}

function candidateFromDeskOverlay(o: OverlayItem, plan: Eagle1MainPlan | null): ZoneCandidate | null {
  const p1 = Number(o.price1 ?? (o as { priceFrozen1?: number }).priceFrozen1);
  const p2 = Number(o.price2 ?? (o as { priceFrozen2?: number }).priceFrozen2);
  if (!Number.isFinite(p1) || !Number.isFinite(p2)) return null;
  const label = String(o.zoneFaceBase || o.label || '');
  const extra = String(o.overlayZoneExtraClass || '');
  const id = String(o.id || '');
  const blob = `${label}${extra}${id}`;
  if (!/★|초강력|반등|하락|HotZone|hotzone|money-zone|rb-rail-bounce|hq-entry|demand|supply/i.test(blob)) {
    return null;
  }
  const isResist =
    o.kind === 'supplyZone' ||
    extra.includes('hotzone-signal--short') ||
    extra.includes('short') ||
    /저항|하락|매도|supply/i.test(blob);
  const isSupport =
    o.kind === 'demandZone' ||
    extra.includes('hotzone-signal--long') ||
    extra.includes('long') ||
    /지지|반등|매수|demand/i.test(blob);
  const side: 'support' | 'resist' = isResist && !isSupport ? 'resist' : 'support';
  const gradeKo = label.split('·')[0]?.trim() || label.trim() || '★존';
  const gradeScore = parseGradeScore(gradeKo);
  let score = gradeScore + Math.min(Number(o.confidence ?? 50), 90) * 0.35;
  if (plan?.direction === 'LONG' && side === 'support') score += 22;
  if (plan?.direction === 'SHORT' && side === 'resist') score += 22;
  const sources: string[] = [];
  if (/hotzone/i.test(blob)) sources.push('HotZone');
  if (/rb-rail|bounce/i.test(blob)) sources.push('레일반등');
  if (/hq|entry/i.test(blob)) sources.push('HQ진입');
  if (/money-zone|ares|mirage/i.test(blob)) sources.push('Mirage·Money');
  if (/poc|ob|fvg/i.test(blob)) sources.push('POC·OB');
  if (!sources.length) sources.push('통합존');
  return {
    side,
    lower: Math.min(p1, p2),
    upper: Math.max(p1, p2),
    score,
    setupScore: Math.round(Math.min(92, gradeScore)),
    sampleN: 0,
    holdPct: null,
    sources,
    gradeKo,
    reactionKo: label.split('·').slice(-1)[0]?.trim() || null,
    clusterId: id || `desk-${side}-${Math.round((p1 + p2) / 2)}`,
    titleKo: side === 'support' ? `AI 지지 · ${gradeKo}` : `AI 저항 · ${gradeKo}`,
  };
}

function candidateFromHotZone(hz: MergedDeskHotZoneEntry, plan: Eagle1MainPlan | null): ZoneCandidate {
  const side = hz.side === 'SHORT' ? 'resist' : 'support';
  const gradeKo = hz.labelKo.includes('★') ? hz.labelKo.split('·')[0]?.trim() ?? hz.labelKo : hz.labelKo;
  let score = hz.score + hz.strength * 8;
  if (plan?.direction === 'LONG' && side === 'support') score += 25;
  if (plan?.direction === 'SHORT' && side === 'resist') score += 25;
  if (hz.primary) score += 15;
  if (hz.touchedNow) score += 10;
  return {
    side,
    lower: Math.min(hz.bot, hz.top),
    upper: Math.max(hz.bot, hz.top),
    score,
    setupScore: Math.round(Math.max(40, Math.min(92, hz.score))),
    sampleN: 0,
    holdPct: null,
    sources: hz.sources.length ? hz.sources : ['HotZone'],
    gradeKo,
    reactionKo: hz.statusKo || null,
    clusterId: hz.id,
    titleKo: side === 'support' ? 'AI 지지 · Hot' : 'AI 저항 · Hot',
  };
}

function mergeClusterCandidates(
  candidates: ZoneCandidate[],
  side: 'support' | 'resist',
  candles: Candle[]
): ZoneCandidate | null {
  const pool = candidates.filter((c) => c.side === side);
  if (!pool.length) return null;
  const anchor = [...pool].sort((a, b) => b.score - a.score)[0]!;
  const anchorMid = (anchor.lower + anchor.upper) / 2;
  const anchorSpan = Math.max(anchor.upper - anchor.lower, anchorMid * 0.0002);
  /** 4% 겹침이면 먼 zone까지 min/max로 늘어남 → 실질 겹침(≥28%)만 병합 */
  const cluster = pool.filter(
    (c) => overlapRatio(anchor.lower, anchor.upper, c.lower, c.upper) >= 0.28
  );
  let lower = anchor.lower;
  let upper = anchor.upper;
  for (const c of cluster) {
    if (c.clusterId === anchor.clusterId) continue;
    const maxExtend = Math.min(anchorSpan * 0.22, maxFuturesZoneSpan(anchorMid, candles, side) * 0.18);
    if (c.lower < anchor.lower) {
      lower = Math.min(lower, Math.max(c.lower, anchor.lower - maxExtend));
    }
    if (c.upper > anchor.upper) {
      upper = Math.max(upper, Math.min(c.upper, anchor.upper + maxExtend));
    }
  }
  const tightened = tightenZoneBounds(lower, upper, candles, side);
  lower = tightened.lower;
  upper = tightened.upper;
  const sources = [...new Set(cluster.flatMap((c) => c.sources))].slice(0, 8);
  const grades = [...new Set(cluster.map((c) => c.gradeKo).filter(Boolean))].slice(0, 4);
  const score =
    cluster.reduce((s, c) => s + c.score, 0) / cluster.length + Math.min(cluster.length, 4) * 10;
  const holdValues = cluster.map((c) => c.holdPct).filter((v): v is number => v != null);
  const holdPct =
    holdValues.length ? Math.round(holdValues.reduce((a, b) => a + b, 0) / holdValues.length) : null;
  const sampleN = Math.max(...cluster.map((c) => c.sampleN));
  return {
    side,
    lower,
    upper,
    score,
    setupScore: Math.round(Math.min(96, 48 + score * 0.28)),
    sampleN,
    holdPct,
    sources,
    gradeKo: grades.join(' · ') || '통합',
    reactionKo: cluster.find((c) => c.reactionKo)?.reactionKo ?? null,
    clusterId: `ai-merged-${side}-${Math.round(lower)}-${Math.round(upper)}`,
    titleKo:
      side === 'support'
        ? `AI 지지 · ${grades.slice(0, 2).join('+') || '통합'}`
        : `AI 저항 · ${grades.slice(0, 2).join('+') || '통합'}`,
  };
}

function isZoneBroken(slot: Eagle1AiZoneSlot, candles: Candle[]): boolean {
  if (candles.length < 2) return false;
  if (isSlotInvalidated(slot, candles)) return true;
  const pad = Math.max((slot.upper - slot.lower) * 0.08, slot.mid * 0.0004);
  const recent = candles.slice(-3);
  if (slot.side === 'support') {
    return recent.filter((c) => c.close < slot.lower - pad).length >= 2;
  }
  if (slot.side === 'resist') {
    return recent.filter((c) => c.close > slot.upper + pad).length >= 2;
  }
  return false;
}

function slotFromSideCandidates(
  candidates: ZoneCandidate[],
  side: 'support' | 'resist',
  role: 'active' | 'ghost',
  candles: Candle[],
  refPrice: number
): Eagle1AiZoneSlot | null {
  const ranked = [...candidates]
    .filter((x) => x.side === side)
    .map((c) => ({ c, action: candidateActionScore(c, refPrice, candles) }))
    .filter((row) => row.action > -1000)
    .sort((a, b) => b.action - a.action)
    .map((row) => row.c);
  const pool = ranked.length ? ranked : candidates.filter((x) => x.side === side);
  const merged = mergeClusterCandidates(pool, side, candles);
  if (merged) {
    const primary = enrichSlotWithLiveState(slotFromCandidate(merged, role, candles), candles, refPrice);
    if (primary && !isZoneBroken(primary, candles)) return primary;
  }
  for (const c of pool) {
    const slot = enrichSlotWithLiveState(slotFromCandidate(c, role, candles), candles, refPrice);
    if (slot && !isZoneBroken(slot, candles)) return slot;
  }
  return null;
}

function slotFromCandidate(
  c: ZoneCandidate,
  role: 'active' | 'ghost',
  candles: Candle[]
): Eagle1AiZoneSlot {
  const kind = c.side === 'entry' ? 'entry' : c.side;
  const bounds = tightenZoneBounds(c.lower, c.upper, candles, kind);
  return {
    side: c.side,
    role,
    titleKo: c.titleKo,
    lower: bounds.lower,
    upper: bounds.upper,
    mid: (bounds.lower + bounds.upper) / 2,
    setupScore: c.setupScore,
    sampleN: c.sampleN,
    holdPct: c.holdPct,
    sources: c.sources,
    gradeKo: c.gradeKo,
    reactionKo: c.reactionKo,
    clusterId: c.clusterId,
  };
}

function overlapRatio(aLo: number, aHi: number, bLo: number, bHi: number): number {
  const lo = Math.max(aLo, bLo);
  const hi = Math.min(aHi, bHi);
  if (hi <= lo) return 0;
  const inter = hi - lo;
  const union = Math.max(aHi, bHi) - Math.min(aLo, bLo);
  return union > 0 ? inter / union : 0;
}

function collectOverlaps(primary: Eagle1AiZoneSlot | null, all: Eagle1AiZoneSlot[]): string[] {
  if (!primary) return [];
  const out = new Set<string>();
  for (const s of all) {
    if (s.clusterId === primary.clusterId) continue;
    if (overlapRatio(primary.lower, primary.upper, s.lower, s.upper) < 0.12) continue;
    for (const src of s.sources) out.add(src);
    if (s.gradeKo) out.add(s.gradeKo);
  }
  for (const src of primary.sources) out.add(src);
  if (primary.gradeKo) out.add(primary.gradeKo);
  return [...out].slice(0, 8);
}

function spotMoveLabel(
  direction: 'LONG' | 'SHORT' | null,
  from: number | null,
  target: number | null,
  pct: number | null
): string {
  if (pct == null || from == null || target == null) return '현물 기준 — · 검증 필요';
  const dir = direction === 'SHORT' ? '하락' : '상승';
  return `현물 기준 약 ${Math.abs(pct).toFixed(1)}% ${dir} (${formatPriceCompact(from)}→${formatPriceCompact(target)}) · 확정 수익 아님`;
}

function calcSpotMovePct(
  direction: 'LONG' | 'SHORT' | null,
  from: number | null,
  target: number | null
): number | null {
  if (from == null || target == null || !Number.isFinite(from) || from <= 0 || !Number.isFinite(target)) {
    return null;
  }
  const raw = direction === 'SHORT' ? ((from - target) / from) * 100 : ((target - from) / from) * 100;
  if (!Number.isFinite(raw)) return null;
  return Math.round(raw * 10) / 10;
}

function buildEvidence(params: {
  analysis: AnalyzeResponse | null;
  plan: Eagle1MainPlan | null;
  combination: CombinationReport | null;
  activeSupport: Eagle1AiZoneSlot | null;
}): Eagle1AiZoneEvidence[] {
  const out: Eagle1AiZoneEvidence[] = [];
  if (!params.analysis) return out;
  const structure = asStructure(params.analysis.eagle1Structure);
  const zones = asZones(params.analysis.eagle1Zones);
  const events = structure?.events ?? [];
  const lastBos = [...events].reverse().find((e) => e.kind === 'BOS');
  const lastChoch = [...events].reverse().find((e) => e.kind === 'CHOCH');
  if (lastBos) {
    out.push({
      label: `Structure ${lastBos.kind}${lastBos.bias === 'bullish' ? ' ↑' : lastBos.bias === 'bearish' ? ' ↓' : ''}`,
      tone: lastBos.bias === 'bullish' ? 'positive' : lastBos.bias === 'bearish' ? 'negative' : 'neutral',
    });
  } else if (lastChoch) {
    out.push({ label: 'Structure CHoCH', tone: 'accent' });
  }
  const poc = zones?.profile?.pocState;
  if (poc) {
    out.push({ label: `Volume POC · ${String(poc)}`, tone: 'accent' });
  }
  const combo = params.combination;
  if (combo?.hits?.length) {
    const hit = combo.hits.find((h) => h.complete) ?? combo.hits[0];
    if (hit?.present?.length) {
      out.push({
        label: `${hit.present.slice(0, 3).join(' · ')} confluence`,
        tone: hit.promote ? 'positive' : 'neutral',
      });
    }
  }
  if (params.activeSupport?.sources.length) {
    const src = params.activeSupport.sources.slice(0, 3).join(' · ');
    if (!out.some((e) => e.label.includes(src))) {
      out.push({ label: src, tone: 'neutral' });
    }
  }
  if (params.plan?.direction) {
    out.push({
      label: `Plan ${params.plan.direction === 'LONG' ? '롱' : '숏'} · ${params.plan.status}`,
      tone: params.plan.direction === 'LONG' ? 'positive' : 'negative',
    });
  }
  return out.slice(0, 6);
}

function lifecycleFromReaction(reaction: ZoneReaction | null): [string, string, string] {
  const k = reaction?.kind ?? 'NONE';
  if (k === 'HOLD' || k === 'RECLAIM') return ['접근', '테스트', '보유'];
  if (k === 'TOUCH' || k === 'RETEST') return ['접근', '테스트', '대기'];
  if (k === 'APPROACH') return ['접근', '대기', '—'];
  if (k === 'REJECT' || k === 'LOST') return ['접근', '거절', '—'];
  return ['접근', '테스트', '보유'];
}

export function buildEagle1AiZonePack(params: {
  analysis: AnalyzeResponse | null;
  candles: Candle[];
  hotZoneEntry?: MergedDeskHotZoneEntryPack | null;
  /** 통합·분석 ★존·HotZone·레일반등 오버레이 */
  deskOverlays?: OverlayItem[];
}): Eagle1AiZonePack | null {
  if (!params.analysis && !(params.deskOverlays?.length || params.hotZoneEntry)) return null;
  const candles =
    params.candles.length >= 2
      ? params.candles
      : ((params.analysis?.eagle1SparkCandles ?? []) as Candle[]);
  if (candles.length < 2 && !(params.deskOverlays?.length || params.hotZoneEntry)) return null;

  const analysis = params.analysis;
  const plan = asPlan(analysis?.eagle1MainPlan);
  const unified = asUnifiedDesk(analysis?.eagle1UnifiedZones);
  const combination = asCombination(analysis?.eagle1Combination);
  const zones = asZones(analysis?.eagle1Zones);
  const reaction = asReaction(zones?.reaction);
  const hud = analysis?.eagle1Hud ?? null;

  const candidates: ZoneCandidate[] = [];
  if (unified) {
    for (const card of unified.support.filter(cardPassesGate)) {
      candidates.push(candidateFromUnified(card, plan));
    }
    for (const card of unified.resist.filter(cardPassesGate)) {
      candidates.push(candidateFromUnified(card, plan));
    }
  }
  const hz = params.hotZoneEntry;
  if (hz?.below) candidates.push(candidateFromHotZone(hz.below, plan));
  if (hz?.above) candidates.push(candidateFromHotZone(hz.above, plan));
  if (hz?.all?.length) {
    for (const row of hz.all) {
      candidates.push(candidateFromHotZone(row, plan));
    }
  }
  for (const o of params.deskOverlays ?? []) {
    const c = candidateFromDeskOverlay(o, plan);
    if (c) candidates.push(c);
  }

  const refPrice = Number(candles[candles.length - 1]?.close) || 0;
  const relevantCandidates =
    refPrice > 0
      ? candidates.filter((c) => isRelevantZoneCandidate(c, refPrice, candles))
      : candidates;
  const pool = relevantCandidates.length ? relevantCandidates : candidates;

  let activeSupport = slotFromSideCandidates(pool, 'support', 'active', candles, refPrice);
  let ghostResist = slotFromSideCandidates(pool, 'resist', 'ghost', candles, refPrice);
  if (!activeSupport && !ghostResist && !candidates.length) return null;

  let entry: Eagle1AiZoneSlot | null = null;
  if (plan?.entryLow != null && plan.entryHigh != null && plan.direction) {
    const rawLo = Math.min(plan.entryLow, plan.entryHigh);
    const rawHi = Math.max(plan.entryLow, plan.entryHigh);
    const entryBounds = tightenZoneBounds(rawLo, rawHi, candles, 'entry');
    const lo = entryBounds.lower;
    const hi = entryBounds.upper;
    entry = enrichSlotWithLiveState(
      {
        side: 'entry',
        role: 'active',
        titleKo: plan.direction === 'LONG' ? 'AI 진입 · 롱' : 'AI 진입 · 숏',
        lower: lo,
        upper: hi,
        mid: (lo + hi) / 2,
        setupScore: plan.aiScore ?? hudSetupScore(hud) ?? null,
        sampleN: plan.sampleSize ?? 0,
        holdPct: clampPct(plan.calibratedProbability),
        sources: ['MainPlan'],
        gradeKo: plan.calibratedLabel ?? null,
        reactionKo: null,
        clusterId: 'eagle1-ai-entry',
      },
      candles,
      refPrice
    );
  } else if (hz?.precision) {
    const p = hz.precision;
    const entryBounds = tightenZoneBounds(p.entry * 0.9998, p.entry * 1.0002, candles, 'entry');
    entry = enrichSlotWithLiveState(
      {
        side: 'entry',
        role: 'active',
        titleKo: p.side === 'LONG' ? 'AI 진입 · 롱' : 'AI 진입 · 숏',
        lower: entryBounds.lower,
        upper: entryBounds.upper,
        mid: p.entry,
        setupScore: null,
        sampleN: 0,
        holdPct: null,
        sources: ['HotZone'],
        gradeKo: null,
        reactionKo: null,
        clusterId: 'hotzone-precision-entry',
      },
      candles,
      refPrice
    );
  }

  const execRaw = {
    direction: (plan?.direction ?? hz?.precision?.side ?? null) as 'LONG' | 'SHORT' | null,
    entry:
      plan?.entryLow != null && plan?.entryHigh != null
        ? (plan.entryLow + plan.entryHigh) / 2
        : hz?.precision?.entry ?? null,
    sl: plan?.sl ?? hz?.precision?.stopLoss ?? null,
    tp1: plan?.tp1 ?? hz?.precision?.tp1 ?? null,
    tp2: plan?.tp2 ?? null,
    tp3: plan?.tp3 ?? null,
  };
  /** 실전 E/SL/TP — 방향·기하 교정 (롱인데 SL>E / TP1<E 방지) */
  let execFromPlan: Eagle1AiZoneExecution = { ...execRaw };
  if (
    execRaw.direction &&
    execRaw.entry != null &&
    execRaw.entry > 0 &&
    execRaw.sl != null &&
    execRaw.sl > 0
  ) {
    const fixed = strengthenUnifiedDeskTradePlan({
      direction: execRaw.direction,
      entry: execRaw.entry,
      stopLoss: execRaw.sl,
      tp1: execRaw.tp1 ?? 0,
      tp2: execRaw.tp2 ?? 0,
      tp3: execRaw.tp3 ?? 0,
      invalidationKo: '',
      sourceKo: 'AI ZONE',
      alignedWithChart: true,
      warningsKo: [],
    });
    execFromPlan = {
      direction: fixed.direction === 'LONG' || fixed.direction === 'SHORT' ? fixed.direction : execRaw.direction,
      entry: fixed.entry,
      sl: fixed.stopLoss,
      tp1: fixed.tp1 > 0 ? fixed.tp1 : null,
      tp2: fixed.tp2 > 0 ? fixed.tp2 : null,
      tp3: fixed.tp3 > 0 ? fixed.tp3 : null,
    };
  }

  const setupScore =
    plan?.aiScore ??
    hudSetupScore(hud) ??
    activeSupport?.setupScore ??
    null;
  const histSample = asHistoricalSample(analysis?.eagle1HistoricalOutcome);
  const sampleN = plan?.sampleSize ?? activeSupport?.sampleN ?? histSample;
  const longPct = clampPct(plan?.longScore ?? analysis?.longScore);
  const shortPct = clampPct(plan?.shortScore ?? analysis?.shortScore);
  const allSlots = [
    ...(activeSupport ? [activeSupport] : []),
    ...(ghostResist ? [ghostResist] : []),
    ...(entry ? [entry] : []),
    ...pool.map((c) => slotFromCandidate(c, 'ghost', candles)),
  ];
  const overlapKo = collectOverlaps(activeSupport, allSlots);

  return {
    setupScore: setupScore != null && Number.isFinite(setupScore) ? Math.round(setupScore) : null,
    sampleN: Math.max(0, Math.round(sampleN)),
    longPct,
    shortPct,
    lifecycleKo: lifecycleFromReaction(reaction),
    activeSupport,
    ghostResist,
    entry,
    evidence: analysis
      ? buildEvidence({ analysis, plan, combination, activeSupport })
      : overlapKo.map((label) => ({ label, tone: 'neutral' as const })),
    execution: execFromPlan,
    footerKo: '차트=결정요약 · HUD=근거·표본 · 확정수익 아님',
    overlapKo,
    candidates: allSlots.slice(0, 12),
  };
}

export function resolveAiZoneSlotByOverlayId(
  pack: Eagle1AiZonePack,
  zoneId: string
): Eagle1AiZoneSlot | null {
  const id = String(zoneId || '');
  const slots = [pack.activeSupport, pack.ghostResist, pack.entry, ...pack.candidates].filter(
    (s): s is Eagle1AiZoneSlot => s != null
  );
  if (id.includes('support')) return pack.activeSupport ?? slots.find((s) => s.side === 'support') ?? null;
  if (id.includes('resist')) return pack.ghostResist ?? slots.find((s) => s.side === 'resist') ?? null;
  if (id.includes('entry')) return pack.entry ?? null;
  const cluster = id.split('--').pop()?.replace('--ghost', '').replace('--active', '');
  return slots.find((s) => s.clusterId === cluster) ?? pack.activeSupport;
}

export function buildEagle1AiZoneClickDetail(params: {
  pack: Eagle1AiZonePack;
  zoneId: string;
  currentPrice?: number | null;
}): Eagle1AiZoneClickDetail {
  const slot =
    resolveAiZoneSlotByOverlayId(params.pack, params.zoneId) ?? params.pack.activeSupport;
  const ex = params.pack.execution;
  const direction = ex.direction ?? (slot?.side === 'resist' ? 'SHORT' : 'LONG');
  const spotFrom = params.currentPrice ?? ex.entry ?? slot?.mid ?? null;
  const spotTarget = ex.tp1 ?? (direction === 'LONG' ? slot?.upper : slot?.lower) ?? null;
  const spotMovePct = calcSpotMovePct(direction, spotFrom, spotTarget);
  const overlaps =
    slot != null ? collectOverlaps(slot, params.pack.candidates) : params.pack.overlapKo;
  return {
    zoneId: params.zoneId,
    titleKo: slot?.titleKo ?? 'AI ZONE',
    sideKo:
      slot?.side === 'resist'
        ? '저항'
        : slot?.side === 'entry'
          ? `${aiZoneEntryDirKo(slot)}진입`
          : '지지',
    overlaps,
    evidence: params.pack.evidence,
    holdPct: slot?.liveHoldPct ?? slot?.holdPct ?? null,
    sampleN: slot?.sampleN ?? params.pack.sampleN,
    setupScore: slot?.setupScore ?? params.pack.setupScore,
    longPct: params.pack.longPct,
    shortPct: params.pack.shortPct,
    spotFrom,
    spotTarget,
    spotMovePct,
    spotMoveLabelKo: spotMoveLabel(direction, spotFrom, spotTarget, spotMovePct),
    execution: ex,
    invalidationKo:
      ex.sl != null
        ? `무효화(SL) ${formatPriceCompact(ex.sl)} · ${direction === 'LONG' ? '이탈 시 시나리오 무효' : '회복 시 시나리오 무효'}`
        : slot
          ? `${formatPriceCompact(slot.lower)}~${formatPriceCompact(slot.upper)} 이탈 시 재검증`
          : '무효화 조건 · 검증 필요',
    disclaimerKo: '겹침·확률은 로그·표본 기반 근사 · 확정 수익·승률 아님',
  };
}

function zoneOverlayFromSlot(
  slot: Eagle1AiZoneSlot,
  lastTime: number,
  candles: Candle[]
): OverlayItem {
  const formed = Number(candles[Math.max(0, candles.length - 48)]?.time) || lastTime - 86400000;
  const ghost = slot.role === 'ghost';
  const long = slot.side === 'support' || (slot.side === 'entry' && slot.titleKo.includes('롱'));
  const livePct = slot.liveHoldPct ?? slot.holdPct;
  const weak = livePct != null && livePct < 30;
  const baseColor = ghost || weak
    ? `rgba(244,63,94,${aiZoneFillAlpha(0.22).toFixed(3)})`
    : long
      ? `rgba(16,185,129,${aiZoneFillAlpha(0.38).toFixed(3)})`
      : slot.side === 'entry'
        ? `rgba(56,189,248,${aiZoneFillAlpha(0.34).toFixed(3)})`
        : `rgba(244,63,94,${aiZoneFillAlpha(0.36).toFixed(3)})`;
  /** 면 우측 알약 제거 — 정보는 가격축 라벨·클릭 카드로 주입 */
  const axisLabel = formatAiZoneSlotLabelKo(slot);
  const sideKo = aiZoneSideLabelKo(slot);
  const pctLine =
    livePct != null
      ? `${sideKo} 가능 ${Math.round(livePct)}%${slot.sampleN >= EAGLE1_MIN_STAT_SAMPLE ? '' : '(추정)'}`
      : formatSamplePct(slot.sampleN, slot.holdPct != null ? slot.holdPct / 100 : null);
  return attachFunctionalOverlayLabel({
    id: `eagle1-ai-zone--${slot.side}--${slot.clusterId}${ghost ? '--ghost' : ''}`,
    kind: slot.side === 'resist' ? 'supplyZone' : slot.side === 'support' ? 'demandZone' : 'zone',
    label: axisLabel,
    x1: 0,
    y1: 0,
    x2: 1,
    y2: 1,
    time1: formed,
    time2: lastTime,
    price1: slot.upper,
    price2: slot.lower,
    priceFrozen1: slot.upper,
    priceFrozen2: slot.lower,
    confidence: ghost || weak ? 28 : livePct ?? 58,
    color: baseColor,
    category: 'zones',
    structureBias: long ? 'bullish' : slot.side === 'resist' ? 'bearish' : undefined,
    overlayZoneExtraClass: `eagle1-zone eagle1-ai-analysis-zone eagle1-ai-zone--${slot.side}${ghost || weak ? ' eagle1-ai-zone--ghost' : ' eagle1-ai-zone--active'} eagle1-ai-zone--clickable merged-desk-zone-face-minimal`,
    zoneFaceBase: '',
    zoneFaceSignal: '',
    zoneFillPreserve: true,
    labelTooltip: `${slot.titleKo} · ${pctLine} · ${slot.reactionKo || '반응대기'} · n=${slot.sampleN || 0} · 축라벨주입 · 확정 아님`,
  });
}

export function buildEagle1AiZoneChartOverlays(params: {
  pack: Eagle1AiZonePack;
  analysis: AnalyzeResponse | null;
  candles: Candle[];
}): OverlayItem[] {
  const candles = params.candles;
  if (candles.length < 2) return [];
  const lastTime = Number(candles[candles.length - 1]?.time);
  if (!(lastTime > 0)) return [];

  const out: OverlayItem[] = [];
  const { pack } = params;
  if (pack.activeSupport) out.push(zoneOverlayFromSlot(pack.activeSupport, lastTime, candles));
  if (pack.ghostResist) out.push(zoneOverlayFromSlot(pack.ghostResist, lastTime, candles));
  if (pack.entry) out.push(zoneOverlayFromSlot(pack.entry, lastTime, candles));

  return out;
}

export function buildEagle1AiZonePriceLines(pack: Eagle1AiZonePack): AtlasPulsePriceLine[] {
  const lines: AtlasPulsePriceLine[] = [];
  const used: number[] = [];
  const near = (p: number) => used.some((u) => Math.abs(u - p) / Math.max(p, 1) < 0.00035);
  const pushZoneAxis = (slot: Eagle1AiZoneSlot | null | undefined, color: string) => {
    if (!slot) return;
    const mid = (Number(slot.upper) + Number(slot.lower)) / 2;
    if (!(mid > 0) || near(mid)) return;
    used.push(mid);
    lines.push({
      price: mid,
      color,
      title: formatAiZoneSlotLabelKo(slot),
      lineWidth: 1,
      lineStyle: 'solid',
      axisLabel: true,
    });
  };
  /** 알약 대신 가격축 한글 라벨 (면 중앙) */
  pushZoneAxis(pack.activeSupport, '#34d399');
  pushZoneAxis(pack.ghostResist, '#f472b6');
  pushZoneAxis(pack.entry, '#38bdf8');

  const ex = pack.execution;
  const dirKo = ex.direction === 'LONG' ? '롱' : ex.direction === 'SHORT' ? '숏' : '';
  if (ex.entry != null && Number.isFinite(ex.entry) && !near(ex.entry)) {
    used.push(ex.entry);
    lines.push({
      price: ex.entry,
      color: '#22c55e',
      title: dirKo ? `E · ${dirKo}` : 'E',
      lineWidth: 2,
      lineStyle: 'dashed',
      axisLabel: true,
    });
  }
  if (ex.sl != null && Number.isFinite(ex.sl) && !near(ex.sl)) {
    used.push(ex.sl);
    lines.push({
      price: ex.sl,
      color: '#f87171',
      title: 'SL',
      lineWidth: 2,
      lineStyle: 'dashed',
      axisLabel: true,
    });
  }
  const tps: Array<{ p: number | null; label: string }> = [
    { p: ex.tp1, label: 'TP1' },
    { p: ex.tp2, label: 'TP2' },
    { p: ex.tp3, label: 'TP3' },
  ];
  for (const row of tps) {
    if (row.p == null || !Number.isFinite(row.p) || near(row.p)) continue;
    used.push(row.p);
    lines.push({
      price: row.p,
      color: '#facc15',
      title: row.label,
      lineWidth: 1,
      lineStyle: 'dotted',
      axisLabel: true,
    });
  }
  return lines;
}

export function formatAiZoneHoldLine(slot: Eagle1AiZoneSlot | null): string {
  if (!slot) return '데이터 없음';
  const pct = slot.liveHoldPct ?? slot.holdPct;
  if (pct != null && Number.isFinite(pct)) {
    const est = slot.sampleN >= EAGLE1_MIN_STAT_SAMPLE ? '' : '추정 ';
    const rx = slot.reactionKo ? ` · ${slot.reactionKo}` : '';
    return `${est}${slot.side === 'resist' ? '저항' : '지지'} ${Math.round(pct)}%${rx}`;
  }
  const hold = formatSamplePct(slot.sampleN, slot.holdPct != null ? slot.holdPct / 100 : null);
  const setup = slot.setupScore != null ? `Setup ${slot.setupScore}` : 'Setup —';
  return `${setup} · ${hold}`;
}

export function formatAiZoneSources(slot: Eagle1AiZoneSlot | null): string {
  if (!slot?.sources.length) return '—';
  return slot.sources.slice(0, 4).join(' · ');
}

export function formatAiZoneExecPrice(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return formatPriceCompact(n);
}
