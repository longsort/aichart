/**
 * 가상매매 — 앱 분석 기능 일괄 스캔 → 진입 후보.
 * 기존 데스크 팩/엔진 재사용. 확정 수익·승률 아님.
 */
import type { Candle } from '@/types';
import type { MergedDeskHotZoneEntry } from '@/lib/mergedDeskHotZoneEntry';
import type { MtfDumpZoneSpec } from '@/lib/mergedDeskMtfDumpZoneBridge';
import type { FourStrategyTradeCandidate } from '@/lib/doksuri1/fourStrategyTypes';
import { FOUR_STRATEGY_KO } from '@/lib/doksuri1/fourStrategyTypes';
import { evaluateFourStrategyPack } from '@/lib/doksuri1/fourStrategyEngine';
import { detectRbRailSfp } from '@/lib/mergedDeskRbEdgeConfluenceGate';
import type { MergedDeskChannelGeom } from '@/lib/mergedDeskBlueRedChannels';
import { structureRocketRowOnLastCandle } from '@/lib/mtfStructureRocket';
import type { VirtualEntrySource } from '@/lib/mergedDeskVirtualTradeSession';
import { resolveUltraScalpRoeCaps, roeTargetPriceSafe } from '@/lib/doksuri1/fourStrategyHelpers';

export type AnalysisTag =
  | '폭락존'
  | '스윕반전'
  | '추세연속'
  | '존방어'
  | '돌파리테스트'
  | '핫존'
  | '스윙미드'
  | '구조로켓'
  | '독수리1호'
  | 'MTF감시'
  | '플랜터치'
  | '고래빔'
  | '기관밴드'
  | 'SFP'
  | 'CVD참고'
  | '재진입';

export type VirtualAnalysisCandidate = {
  source: VirtualEntrySource | string;
  side: 'LONG' | 'SHORT';
  entry: number;
  stop: number;
  tp1: number;
  tp2?: number;
  score: number;
  signalKo: string;
  analysisTags: AnalysisTag[];
  fourStrategyId?: string | null;
  fourSupporting?: string[] | null;
  entryScore?: number | null;
  regime?: string | null;
};

export type VirtualAnalysisScanPack = {
  candidates: VirtualAnalysisCandidate[];
  best: VirtualAnalysisCandidate | null;
  stripKo: string;
  detailKo: string;
};

function atr14(candles: Candle[]): number {
  const n = candles.length;
  if (n < 5) return Math.abs(Number(candles[n - 1]?.close) || 1) * 0.008;
  let s = 0;
  let c = 0;
  for (let i = Math.max(1, n - 14); i < n; i++) {
    const a = candles[i]!;
    const b = candles[i - 1]!;
    s += Math.max(a.high - a.low, Math.abs(a.high - b.close), Math.abs(a.low - b.close));
    c += 1;
  }
  return c > 0 ? s / c : Math.abs(Number(candles[n - 1]?.close) || 1) * 0.008;
}

function nearZone(
  px: number,
  bot: number,
  top: number,
  atr: number
): boolean {
  if (!(px > 0 && bot > 0 && top > 0)) return false;
  const lo = Math.min(bot, top) - atr * 0.15;
  const hi = Math.max(bot, top) + atr * 0.15;
  return px >= lo && px <= hi;
}

/** 진입은 항상 실시간 마크. 후보가가 멀면(0.25%↑) 제외. */
export const VIRTUAL_ENTRY_MARK_MAX_SLIP = 0.0025;

export function resolveVirtualMarkPrice(params: {
  livePrice?: number | null;
  candles: Candle[];
}): number {
  const live = Number(params.livePrice);
  if (live > 0) return live;
  const n = params.candles.length;
  if (n < 1) return 0;
  const last = Number(params.candles[n - 1]?.close);
  return last > 0 ? last : 0;
}

function snapEntryToMark(candidateEntry: number, mark: number): number | null {
  if (!(mark > 0)) return null;
  if (!(candidateEntry > 0)) return mark;
  const slip = Math.abs(candidateEntry - mark) / mark;
  if (slip > VIRTUAL_ENTRY_MARK_MAX_SLIP) return null;
  return mark;
}

function isDemandZone(z: { bandRole?: string | null }): boolean {
  return z.bandRole !== 'ceiling';
}

/**
 * 데스크에 있는 분석들을 한 번에 스캔.
 * 충돌(롱/숏 동시 고점)이면 best=null (WAIT).
 */
export function scanVirtualAnalysisEntries(params: {
  symbol: string;
  timeframe: string;
  candles: Candle[];
  leverage: number;
  tp1RoePct?: number;
  tp2RoePct?: number;
  dumpZones?: MtfDumpZoneSpec[] | null;
  hotZones?: MergedDeskHotZoneEntry[] | null;
  swingMid?: {
    direction?: 'LONG' | 'SHORT' | 'NEUTRAL' | null;
    entry?: number | null;
    stopLoss?: number | null;
    tp1?: number | null;
  } | null;
  activePlan?: {
    direction?: 'LONG' | 'SHORT' | 'NEUTRAL' | null;
    entry?: number | null;
    stopLoss?: number | null;
    tp1?: number | null;
  } | null;
  structureRocketSignals?: unknown;
  rocketDir?: 'LONG' | 'SHORT' | null;
  geom?: MergedDeskChannelGeom | null;
  doksuriAction?: 'CONFIRMED_LONG' | 'CONFIRMED_SHORT' | string | null;
  doksuriEntry?: number | null;
  doksuriSl?: number | null;
  doksuriTp?: number | null;
  whaleBias?: 'LONG' | 'SHORT' | 'NEUTRAL' | null;
  fourCandidate?: FourStrategyTradeCandidate | null;
  livePrice?: number | null;
}): VirtualAnalysisScanPack {
  const candles = params.candles;
  const n = candles.length;
  if (n < 16) {
    return {
      candidates: [],
      best: null,
      stripKo: '분석스캔 · 데이터부족',
      detailKo: '캔들 부족',
    };
  }
  /** 신호 판정 = 확정봉 / 체결가 = 실시간 마크(마지막봉·live) */
  const iClosed = Math.max(0, n - 2);
  const px = resolveVirtualMarkPrice({ livePrice: params.livePrice, candles });
  if (!(px > 0)) {
    return {
      candidates: [],
      best: null,
      stripKo: '분석스캔 · 가격없음',
      detailKo: '실시간 마크 없음',
    };
  }
  const atr = atr14(candles.slice(0, iClosed + 1));
  const lev = Math.max(1, Math.min(125, params.leverage || 10));
  const caps = resolveUltraScalpRoeCaps({
    leverage: lev,
    tp1RoePct: params.tp1RoePct ?? 5,
    tp2RoePct: params.tp2RoePct ?? 10,
  });
  const out: VirtualAnalysisCandidate[] = [];
  const dumps = params.dumpZones ?? [];
  const nearDemand = dumps.some((z) => nearZone(px, z.bot, z.top, atr) && isDemandZone(z));
  const nearSupply = dumps.some((z) => nearZone(px, z.bot, z.top, atr) && !isDemandZone(z));

  const sfp =
    params.geom && atr > 0
      ? detectRbRailSfp(candles.slice(0, iClosed + 1), params.geom, atr)
      : null;

  const rocketHit = structureRocketRowOnLastCandle(
    params.structureRocketSignals as never,
    candles,
    params.timeframe
  );
  const rocket =
    params.rocketDir ?? rocketHit?.direction ?? null;

  const pushCand = (c: VirtualAnalysisCandidate) => {
    /** 지지 근처 숏 / 저항 근처 롱 금지 */
    if (c.side === 'SHORT' && nearDemand && !nearSupply) return;
    if (c.side === 'LONG' && nearSupply && !nearDemand) return;
    const entry = snapEntryToMark(c.entry, px);
    if (entry == null) return;
    out.push({ ...c, entry });
  };

  /** 4전략 — 체결가는 마크 스냅 */
  let four = params.fourCandidate ?? null;
  if (!four) {
    try {
      const pack = evaluateFourStrategyPack({
        symbol: params.symbol,
        timeframe: params.timeframe,
        candles,
        dumpZones: params.dumpZones,
        rocketDir: rocket,
        sfp: sfp ? { side: sfp.side, price: sfp.price } : null,
        leverage: lev,
        tp1RoePct: params.tp1RoePct,
        tp2RoePct: params.tp2RoePct,
      });
      if (pack.candidate && !pack.candidate.rejectReason && pack.candidate.allowPaper) {
        four = pack.candidate;
      }
    } catch {
      /* keep */
    }
  }
  if (four && four.entry > 0) {
    const tags: AnalysisTag[] = [
      FOUR_STRATEGY_KO[four.primaryStrategy] as AnalysisTag,
      ...four.supportingStrategies.map((id) => FOUR_STRATEGY_KO[id] as AnalysisTag),
    ];
    if (sfp) tags.push('SFP');
    if (rocket === four.side) tags.push('구조로켓');
    pushCand({
      source: 'four-strategy',
      side: four.side,
      entry: four.entry,
      stop: four.stop,
      tp1: four.tp1,
      tp2: four.tp2,
      score: four.score,
      signalKo: `4전략·${FOUR_STRATEGY_KO[four.primaryStrategy]} ${four.side === 'LONG' ? '롱' : '숏'}`,
      analysisTags: [...new Set(tags)],
      fourStrategyId: four.primaryStrategy,
      fourSupporting: four.supportingStrategies,
      entryScore: four.score,
      regime: four.regime,
    });
  }

  /** 폭락존 근접 + SFP/로켓 */
  for (const z of dumps) {
    if (!nearZone(px, z.bot, z.top, atr)) continue;
    const longBias = isDemandZone(z);
    const side: 'LONG' | 'SHORT' = longBias ? 'LONG' : 'SHORT';
    const sfpOk =
      (side === 'LONG' && sfp?.side === 'bull') || (side === 'SHORT' && sfp?.side === 'bear');
    const rocketOk = rocket === side;
    if (!sfpOk && !rocketOk) continue;
    const stop = side === 'LONG' ? z.bot - atr * 0.12 : z.top + atr * 0.12;
    const tp1 = roeTargetPriceSafe(px, side, lev, caps.tp1Roe);
    const tags: AnalysisTag[] = ['폭락존'];
    if (sfpOk) tags.push('SFP');
    if (rocketOk) tags.push('구조로켓');
    pushCand({
      source: 'dump-zone',
      side,
      entry: px,
      stop,
      tp1,
      score: 58 + (sfpOk ? 12 : 0) + (rocketOk ? 10 : 0),
      signalKo: `폭락존반응 · ${z.labelKo || z.sourceTf} · ${side === 'LONG' ? '롱' : '숏'}`,
      analysisTags: tags,
    });
  }

  /** 핫존 */
  for (const hz of params.hotZones ?? []) {
    if (!nearZone(px, hz.bot, hz.top, atr)) continue;
    if (!(hz.touchedNow || hz.status === 'ENTER' || hz.status === 'TOUCH')) continue;
    const side = hz.side;
    if (rocket && rocket !== side && !sfp) continue;
    const stop = side === 'LONG' ? hz.bot - atr * 0.1 : hz.top + atr * 0.1;
    const tags: AnalysisTag[] = ['핫존'];
    if (rocket === side) tags.push('구조로켓');
    if (sfp) tags.push('SFP');
    pushCand({
      source: 'hot-zone',
      side,
      entry: px,
      stop,
      tp1: roeTargetPriceSafe(px, side, lev, caps.tp1Roe),
      score: 60 + (hz.grade === 'A' ? 8 : 0) + (rocket === side ? 8 : 0),
      signalKo: `핫존 · ${hz.labelKo || (side === 'LONG' ? '롱' : '숏')}`,
      analysisTags: tags,
    });
  }

  /** 스윙미드 */
  const sm = params.swingMid;
  if (
    sm &&
    (sm.direction === 'LONG' || sm.direction === 'SHORT') &&
    sm.entry != null &&
    sm.entry > 0 &&
    Math.abs(px - sm.entry) / sm.entry < 0.004
  ) {
    const side = sm.direction;
    const stop =
      sm.stopLoss != null && sm.stopLoss > 0
        ? sm.stopLoss
        : side === 'LONG'
          ? px - atr * 0.8
          : px + atr * 0.8;
    const tp1 =
      sm.tp1 != null && sm.tp1 > 0 ? sm.tp1 : roeTargetPriceSafe(px, side, lev, caps.tp1Roe);
    pushCand({
      source: 'swing-mid',
      side,
      entry: px,
      stop,
      tp1,
      score: 64,
      signalKo: `스윙미드 · ${side === 'LONG' ? '롱' : '숏'}`,
      analysisTags: ['스윙미드', rocket === side ? '구조로켓' : '스윙미드'].filter(
        (x, i, a) => a.indexOf(x) === i
      ) as AnalysisTag[],
    });
  }

  /**
   * 구조로켓 — 해당 방향 존 재터치일 때만 (SFP만으로 중간 추격 금지).
   */
  if (rocket) {
    const side = rocket;
    const sfpOk =
      (side === 'LONG' && sfp?.side === 'bull') || (side === 'SHORT' && sfp?.side === 'bear');
    const zoneOk = dumps.some((z) => {
      if (!nearZone(px, z.bot, z.top, atr)) return false;
      return side === 'LONG' ? isDemandZone(z) : !isDemandZone(z);
    });
    if (zoneOk) {
      const rocketSl =
        rocketHit?.direction === side &&
        rocketHit.stopLoss != null &&
        rocketHit.stopLoss > 0
          ? rocketHit.stopLoss
          : null;
      const atrStop = side === 'LONG' ? px - atr * 0.7 : px + atr * 0.7;
      /** 로켓 구조 SL 우선 · ATR 폴백만 (신호봉 고/저 무효화) */
      let stop = rocketSl ?? atrStop;
      if (side === 'LONG' && !(stop < px)) stop = atrStop;
      if (side === 'SHORT' && !(stop > px)) stop = atrStop;
      pushCand({
        source: 'structure-rocket',
        side,
        entry: px,
        stop,
        tp1: roeTargetPriceSafe(px, side, lev, caps.tp1Roe),
        score: 55 + (sfpOk ? 10 : 0) + 6 + (rocketSl != null ? 4 : 0),
        signalKo: `구조로켓 · ${side === 'LONG' ? '롱' : '숏'} · 존터치${rocketSl != null ? ' · 구조SL' : ''}`,
        analysisTags: sfpOk ? ['구조로켓', 'SFP', '존터치'] : ['구조로켓', '존터치'],
      });
    }
  }

  /** 독수리1호 */
  if (
    (params.doksuriAction === 'CONFIRMED_LONG' || params.doksuriAction === 'CONFIRMED_SHORT') &&
    params.doksuriEntry != null &&
    params.doksuriEntry > 0 &&
    Math.abs(px - params.doksuriEntry) / params.doksuriEntry <= 0.008
  ) {
    const side = params.doksuriAction === 'CONFIRMED_LONG' ? 'LONG' : 'SHORT';
    pushCand({
      source: 'doksuri1',
      side,
      entry: px,
      stop:
        params.doksuriSl != null && params.doksuriSl > 0
          ? params.doksuriSl
          : side === 'LONG'
            ? px - atr
            : px + atr,
      tp1:
        params.doksuriTp != null && params.doksuriTp > 0
          ? params.doksuriTp
          : roeTargetPriceSafe(px, side, lev, caps.tp1Roe),
      score: 78,
      signalKo: '독수리1호 확정',
      analysisTags: ['독수리1호'],
    });
  }

  /** 액티브 플랜 E 터치 — 자동진입 후보에서 제외(사용자 취소 · 차트 플랜 표시는 유지) */
  void params.activePlan;
  // plan-touch pushCand 비활성

  /** 고래빔 — 방향 보너스만 (단독 진입 금지, 후보에 태그) */
  if (params.whaleBias === 'LONG' || params.whaleBias === 'SHORT') {
    for (const c of out) {
      if (c.side === params.whaleBias) {
        c.score = Math.min(100, c.score + 5);
        if (!c.analysisTags.includes('고래빔')) c.analysisTags.push('고래빔');
      }
    }
  }

  out.sort((a, b) => b.score - a.score);
  const bestL = out.find((c) => c.side === 'LONG');
  const bestS = out.find((c) => c.side === 'SHORT');
  if (bestL && bestS && Math.abs(bestL.score - bestS.score) < 8) {
    return {
      candidates: out,
      best: null,
      stripKo: `분석스캔 · 롱숏충돌 WAIT · 마크 ${Math.round(px)}`,
      detailKo: `롱${bestL.score}/숏${bestS.score}`,
    };
  }
  const best = out[0] && out[0].score >= 58 ? out[0] : null;
  return {
    candidates: out,
    best,
    stripKo: best
      ? `분석진입 · ${best.signalKo} · ${best.analysisTags.join('+')} · @${Math.round(px)}`
      : `분석스캔 · 대기 · 마크 ${Math.round(px)}`,
    detailKo: best
      ? `점수${best.score} · 태그 ${best.analysisTags.join(', ')} · 진입마크 ${px}`
      : `후보 ${out.length}건 · 기준미달/충돌/존반대`,
  };
}
