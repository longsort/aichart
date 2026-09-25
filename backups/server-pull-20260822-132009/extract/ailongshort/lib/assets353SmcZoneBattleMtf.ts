/**
 * Zone Battle MTF — 1m~1M 각 봉 + 가중 합산 (조건부 참고).
 */
import type { Candle } from '@/types';
import type { Assets353Verdict } from '@/lib/assets353CandleKnowledgeEngine';
import type { MergedSmcLeadingContext } from '@/lib/mergedAnalysisSmcLeading';
import { MTF_SIGNAL_BOARD_TFS } from '@/lib/mtfSignalBoardDigest';
import { detectSmcStructureOrderBlocks } from '@/lib/smcStructureOrderBlocks';
import { computeObStatIntel, computeSrHoldPct } from '@/lib/assets353SmcStatIntel';
import { atrRecent } from '@/lib/smcDeskOverlay';
import {
  computeSmcZoneBattleVerdict,
  type SmcZoneBattleVerdict,
} from '@/lib/assets353SmcZoneConflictIntel';

export const ZONE_BATTLE_MTF_TFS = MTF_SIGNAL_BOARD_TFS;

export const ZONE_BATTLE_TF_KO: Record<string, string> = {
  '1m': '1분',
  '3m': '3분',
  '5m': '5분',
  '15m': '15분',
  '1h': '1시간',
  '4h': '4시간',
  '1d': '일봉',
  '1w': '주봉',
  '1M': '월봉',
};

const TF_WEIGHT: Record<string, number> = {
  '1m': 0.45,
  '3m': 0.55,
  '5m': 0.65,
  '15m': 0.85,
  '1h': 1.0,
  '4h': 1.35,
  '1d': 1.65,
  '1w': 2.0,
  '1M': 2.4,
};

export type MtfZoneBattleRow = {
  tf: string;
  tfKo: string;
  longPct: number;
  shortPct: number;
  breakoutPct: number;
  dominant: 'LONG' | 'SHORT' | 'NEUTRAL';
  headlineKo: string;
  active: boolean;
  reasonsKo: string[];
};

export type MtfZoneBattlePack = {
  rows: MtfZoneBattleRow[];
  aggregate: SmcZoneBattleVerdict;
  zoneBot: number;
  zoneTop: number;
  alignedTfCount: number;
  conflictTfCount: number;
  summaryKo: string;
  updatedAt: number;
};

function zoneOverlap(aBot: number, aTop: number, bBot: number, bTop: number): boolean {
  return Math.min(aTop, bTop) - Math.max(aBot, bBot) > 0;
}

/** 가격 구간 내 OB·S/R 기반 전투 cluster (오버레이 없이 TF 단독) */
function buildBattleClusterAtRange(
  candles: Candle[],
  zoneBot: number,
  zoneTop: number,
  tf: string
): Parameters<typeof computeSmcZoneBattleVerdict>[1] | null {
  const n = candles.length;
  if (n < 16) return null;
  const t1 = Number(candles[Math.max(0, n - 96)]!.time);
  const t2 = Number(candles[n - 1]!.time);
  const { validObs } = detectSmcStructureOrderBlocks(candles);
  const cluster: Array<{
    id: string;
    idx: number;
    top: number;
    bot: number;
    t1: number;
    t2: number;
    bull: boolean;
    bear: boolean;
    obPct: number;
    srPct: number;
    kind: 'ob' | 'sr' | 'liq' | 'fvg' | 'other';
  }> = [];

  for (const ob of validObs) {
    if (!zoneOverlap(zoneBot, zoneTop, ob.low, ob.high)) continue;
    const intel = computeObStatIntel(candles, ob);
    const bull = ob.bias === 'bullish';
    cluster.push({
      id: `mtf-ob-${tf}-${ob.index}`,
      idx: ob.index,
      top: ob.high,
      bot: ob.low,
      t1,
      t2,
      bull,
      bear: !bull,
      obPct: intel.pct,
      srPct: intel.pct,
      kind: 'ob',
    });
  }

  const mid = (zoneTop + zoneBot) / 2;
  const supPct = computeSrHoldPct(candles, zoneBot, 'support');
  const resPct = computeSrHoldPct(candles, zoneTop, 'resistance');
  cluster.push({
    id: `mtf-sup-${tf}`,
    idx: -1,
    top: zoneBot + (zoneTop - zoneBot) * 0.35,
    bot: zoneBot,
    t1,
    t2,
    bull: true,
    bear: false,
    obPct: supPct,
    srPct: supPct,
    kind: 'sr',
  });
  cluster.push({
    id: `mtf-res-${tf}`,
    idx: -2,
    top: zoneTop,
    bot: zoneTop - (zoneTop - zoneBot) * 0.35,
    t1,
    t2,
    bull: false,
    bear: true,
    obPct: resPct,
    srPct: resPct,
    kind: 'sr',
  });

  const hasBull = cluster.some((z) => z.bull && !z.bear);
  const hasBear = cluster.some((z) => z.bear && !z.bull);
  if (!hasBull || !hasBear) {
    const close = candles[n - 1]!.close;
    if (close >= mid) {
      cluster.push({
        id: `mtf-bias-bull-${tf}`,
        idx: -3,
        top: zoneTop,
        bot: mid,
        t1,
        t2,
        bull: true,
        bear: false,
        obPct: 52,
        srPct: 52,
        kind: 'other',
      });
    } else {
      cluster.push({
        id: `mtf-bias-bear-${tf}`,
        idx: -4,
        top: mid,
        bot: zoneBot,
        t1,
        t2,
        bull: false,
        bear: true,
        obPct: 52,
        srPct: 52,
        kind: 'other',
      });
    }
  }

  const bulls = cluster.filter((z) => z.bull && !z.bear);
  const bears = cluster.filter((z) => z.bear && !z.bull);
  if (!bulls.length || !bears.length) return null;
  return cluster as Parameters<typeof computeSmcZoneBattleVerdict>[1];
}

/** 단일 TF · 가격 구간 전투 */
export function computeZoneBattleForTfRange(
  candles: Candle[],
  tf: string,
  zoneBot: number,
  zoneTop: number,
  ctx: {
    verdict?: Assets353Verdict | null;
    smcLeading?: MergedSmcLeadingContext | null;
  }
): SmcZoneBattleVerdict | null {
  if (!(zoneTop > zoneBot) || candles.length < 16) return null;
  const cluster = buildBattleClusterAtRange(candles, zoneBot, zoneTop, tf);
  if (!cluster) return null;
  return computeSmcZoneBattleVerdict(candles, cluster, ctx);
}

function aggregateMtfBattles(
  rows: MtfZoneBattleRow[],
  zoneBot: number,
  zoneTop: number
): SmcZoneBattleVerdict {
  const active = rows.filter((r) => r.active);
  if (!active.length) {
    return {
      longPct: 50,
      shortPct: 50,
      breakoutPct: 40,
      buyStrength: 'medium',
      sellStrength: 'medium',
      dominant: 'NEUTRAL',
      headlineKo: '⚔ MTF — 겹침 zone 없음',
      detailKo: '각 TF에서 롱·숏 OB 겹침이 약함 — 참고용',
      reasonsKo: [],
    };
  }
  let longW = 0;
  let shortW = 0;
  let brkW = 0;
  let wSum = 0;
  for (const r of active) {
    const w = TF_WEIGHT[r.tf] ?? 1;
    longW += r.longPct * w;
    shortW += r.shortPct * w;
    brkW += r.breakoutPct * w;
    wSum += w;
  }
  const norm = wSum || 1;
  let longPct = Math.round(longW / norm);
  let shortPct = Math.round(shortW / norm);
  const tot = longPct + shortPct || 1;
  longPct = Math.round((longPct / tot) * 100);
  shortPct = 100 - longPct;
  longPct = Math.max(32, Math.min(68, longPct));
  shortPct = 100 - longPct;
  const breakoutPct = Math.round(brkW / norm);
  const edge = Math.abs(longPct - shortPct);
  const buyStrength =
    longPct >= 58 && edge >= 10 ? 'strong' : longPct >= 48 ? 'medium' : 'weak';
  const sellStrength =
    shortPct >= 58 && edge >= 10 ? 'strong' : shortPct >= 48 ? 'medium' : 'weak';
  const dominant: SmcZoneBattleVerdict['dominant'] =
    longPct >= 56 && edge >= 8 ? 'LONG' : shortPct >= 56 && edge >= 8 ? 'SHORT' : 'NEUTRAL';
  const brkKo = breakoutPct >= 55 ? '돌파가능' : breakoutPct >= 45 ? '돌파주의' : '박스우세';
  const buyKo = buyStrength === 'strong' ? '매수강' : buyStrength === 'medium' ? '매수보통' : '매수약';
  const sellKo = sellStrength === 'strong' ? '매도강' : sellStrength === 'medium' ? '매도보통' : '매도약';
  return {
    longPct,
    shortPct,
    breakoutPct,
    buyStrength,
    sellStrength,
    dominant,
    headlineKo: `⚔ MTF L${longPct}%·S${shortPct}% · ${buyKo}/${sellKo} · ${brkKo}`,
    detailKo: `${active.length}개 TF 겹침 — ${active.map((r) => `${r.tfKo} L${r.longPct}`).join(' · ')}`,
    reasonsKo: [`MTF ${active.length}/${rows.length} TF 활성`, `가중 합산 L${longPct}% S${shortPct}%`],
  };
}

/** 다중 TF 캔들 → MTF Zone Battle 패키지 */
export function buildMtfZoneBattlePack(params: {
  zoneBot: number;
  zoneTop: number;
  tfCandles: Array<{ tf: string; candles: Candle[] }>;
  chartTf?: string;
  verdict?: Assets353Verdict | null;
  smcLeading?: MergedSmcLeadingContext | null;
}): MtfZoneBattlePack {
  const { zoneBot, zoneTop, tfCandles, verdict, smcLeading } = params;
  const ctx = { verdict, smcLeading };
  const rows: MtfZoneBattleRow[] = [];

  for (const tf of ZONE_BATTLE_MTF_TFS) {
    const row = tfCandles.find((x) => x.tf === tf);
    const candles = row?.candles ?? [];
    const battle = candles.length >= 16 ? computeZoneBattleForTfRange(candles, tf, zoneBot, zoneTop, ctx) : null;
    const active = battle != null && (battle.longPct !== 50 || battle.shortPct !== 50);
    rows.push({
      tf,
      tfKo: ZONE_BATTLE_TF_KO[tf] ?? tf,
      longPct: battle?.longPct ?? 50,
      shortPct: battle?.shortPct ?? 50,
      breakoutPct: battle?.breakoutPct ?? 40,
      dominant: battle?.dominant ?? 'NEUTRAL',
      headlineKo: battle?.headlineKo ?? `${ZONE_BATTLE_TF_KO[tf] ?? tf} — 데이터 부족`,
      active: Boolean(battle && active),
      reasonsKo: battle?.reasonsKo ?? [],
    });
  }

  const aggregate = aggregateMtfBattles(rows, zoneBot, zoneTop);
  const alignedTfCount = rows.filter(
    (r) => r.active && r.dominant === aggregate.dominant && aggregate.dominant !== 'NEUTRAL'
  ).length;
  const conflictTfCount = rows.filter(
    (r) => r.active && r.dominant !== 'NEUTRAL' && r.dominant !== aggregate.dominant
  ).length;

  return {
    rows,
    aggregate,
    zoneBot,
    zoneTop,
    alignedTfCount,
    conflictTfCount,
    summaryKo: `${aggregate.headlineKo} · ${alignedTfCount}TF 일치${conflictTfCount ? ` · ${conflictTfCount}TF 상충` : ''}`,
    updatedAt: Date.now(),
  };
}

/** overlay·현재가에서 zone 범위 추출 */
export function resolveZoneBattlePriceRange(params: {
  overlays: Array<{ id?: string; price1?: number; price2?: number; kind?: string }>;
  currentPrice: number | null;
  selectedZoneId?: string | null;
}): { bot: number; top: number } | null {
  const { overlays, currentPrice, selectedZoneId } = params;
  if (selectedZoneId) {
    const sel = overlays.find((o) => String(o.id) === selectedZoneId);
    if (sel) {
      const p1 = Number(sel.price1);
      const p2 = Number(sel.price2);
      if (Number.isFinite(p1) && Number.isFinite(p2)) {
        return { bot: Math.min(p1, p2), top: Math.max(p1, p2) };
      }
    }
  }
  const conflicts = overlays.filter((o) => String(o.id || '').includes('merged-ares-mlsp-tv-conflict-'));
  if (conflicts.length) {
    const c = conflicts[conflicts.length - 1]!;
    const p1 = Number(c.price1);
    const p2 = Number(c.price2);
    if (Number.isFinite(p1) && Number.isFinite(p2)) {
      return { bot: Math.min(p1, p2), top: Math.max(p1, p2) };
    }
  }
  const price = currentPrice;
  if (price == null || !Number.isFinite(price)) return null;
  const pad = price * 0.004;
  return { bot: price - pad * 2, top: price + pad * 2 };
}

export function battleFromOverlay(overlay: {
  zoneFaceDetailKo?: string;
  labelTooltip?: string;
  label?: string;
  zoneFaceBase?: string;
}): SmcZoneBattleVerdict | null {
  const raw = String(overlay.zoneFaceDetailKo || overlay.labelTooltip || overlay.label || '').trim();
  const m = raw.match(/롱\s*(\d+)%.*?숏\s*(\d+)%/i) || raw.match(/L(\d+)%·S(\d+)%/);
  if (!m) return null;
  const longPct = Number(m[1]);
  const shortPct = Number(m[2]);
  if (!Number.isFinite(longPct) || !Number.isFinite(shortPct)) return null;
  const brk = raw.match(/돌파\s*(\d+)%/);
  const breakoutPct = brk ? Number(brk[1]) : 45;
  const edge = Math.abs(longPct - shortPct);
  const dominant: SmcZoneBattleVerdict['dominant'] =
    longPct >= 56 && edge >= 8 ? 'LONG' : shortPct >= 56 && edge >= 8 ? 'SHORT' : 'NEUTRAL';
  return {
    longPct,
    shortPct,
    breakoutPct: Number.isFinite(breakoutPct) ? breakoutPct : 45,
    buyStrength: longPct >= 58 && edge >= 10 ? 'strong' : longPct >= 48 ? 'medium' : 'weak',
    sellStrength: shortPct >= 58 && edge >= 10 ? 'strong' : shortPct >= 48 ? 'medium' : 'weak',
    dominant,
    headlineKo: String(overlay.zoneFaceBase || overlay.label || '').trim(),
    detailKo: raw,
    reasonsKo: raw.split('·').map((s) => s.trim()).filter(Boolean).slice(0, 5),
  };
}
