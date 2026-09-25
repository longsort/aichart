/**
 * 신호 정확도 기록부 — 캔들 tone·AI ZONE % 터치·N봉 결과 자동 스캔.
 * 조건부 표본·검증용 — 확정 승률·수익 보장 아님.
 */
import type { Candle, AnalyzeResponse } from '@/types';
import type { Eagle1AiZonePack, Eagle1AiZoneSlot } from '@/lib/eagle1/aiZonePack';
import { formatAiZoneSlotLabelKo } from '@/lib/eagle1/aiZonePack';
import type { MergedDeskActiveTradePlan } from '@/lib/mergedDeskActiveTradePlan';
import type { PracticeAiPlanPack } from '@/lib/mergedDeskPracticeAiPlan';
import type { Scalp200PlanPack } from '@/lib/mergedDeskScalp200Plan';
import type { MtfDumpZoneSpec } from '@/lib/mergedDeskMtfDumpZoneBridge';
import { mtfDumpSlotKey } from '@/lib/mergedDeskMtfDumpZoneBridge';
import type { VolumeAiZone, VolumeAiZonePack, VolumeVerdictSide } from '@/lib/volumeAiZoneEngine';
import { verdictShortKo } from '@/lib/volumeAiZoneEngine';
import { DUMP_LIFE_KO, type DumpLifeState } from '@/lib/mergedDeskDumpLifeCycle';
import {
  computeInstitutionalBandInteractionMarkersUnion,
  INSTITUTIONAL_BAND_DEFAULT_MULT,
  INSTITUTIONAL_BAND_DEFAULT_PERIOD,
  institutionalBandTouchMinGapBars,
} from '@/lib/institutionalSuperBand';
import type { MergedDeskRbCorridorPaint } from '@/lib/mergedDeskRbCorridorPaint';
import type { MergedDeskRbMasterStance } from '@/lib/mergedDeskRbMasterStance';
import type { MergedDeskRbLiveEntryHub } from '@/lib/mergedDeskRbLiveEntryHub';
import { sanitizeChartCandlesForSeries } from '@/lib/volumeHistogramIntelligence';
import {
  mergeSignalJournalMeta,
  type DeskSignalContextInput,
} from '@/lib/mergedDeskSignalJournalContext';
import { scanSignalJournalReinforce } from '@/lib/mergedDeskSignalJournalReinforce';
import { buildSignalJournalAnalytics } from '@/lib/mergedDeskSignalJournalAnalytics';
import type { MasterFuturesDecision } from '@/lib/mergedDeskMasterFuturesDecision';
import {
  buildAiCandleToneByTime,
  toneKoShort,
  toneToJournalDirection,
  type AiCandleDumpZoneHint,
} from '@/lib/aiCandleBorderEngine';
import {
  buildDeskLearningSnapshotMeta,
  learningSnapshotDirection,
  type DeskLearningFeatureFlags,
} from '@/lib/mergedDeskLearningSnapshot';
import { dumpZoneStableId } from '@/lib/mergedDeskLearningSnapshot';
import {
  appendTradeJournalEvent,
  readTradeEventJournal,
  TRADE_JOURNAL_OUTCOME_KINDS,
  TRADE_JOURNAL_OUTCOME_SOURCE_KINDS,
  type TradeJournalEvent,
} from '@/lib/mergedDeskTradeEventJournal';
import {
  candleTouchesZone,
  computeForwardOutcome,
  createSignalId,
  findCandleIndexByTime,
  outcomeKindForHorizon,
  OUTCOME_BAR_HORIZONS,
  type OutcomeHorizon,
} from '@/lib/mergedDeskSignalOutcomeEngine';

const dumpLifeMem = new Map<string, DumpLifeState>();
const rbCorridorMem = new Map<string, string>();

function recordWithContext(
  base: Omit<TradeJournalEvent, 'id' | 'at'> & { id?: string; at?: number },
  ctx: DeskSignalContextInput | null | undefined
): TradeJournalEvent {
  if (!ctx) return appendTradeJournalEvent(base);
  return appendTradeJournalEvent({
    ...base,
    meta: mergeSignalJournalMeta(base.meta, ctx, base.direction),
  });
}

function dumpExpectedDirection(z: MtfDumpZoneSpec): 'LONG' | 'SHORT' | 'NEUTRAL' {
  const ls = z.lifeState;
  if (ls === 'CONFIRM_DOWN' || ls === 'CONFIRM_RESIST') return 'SHORT';
  if (ls === 'CONFIRM_UP') return 'LONG';
  if (z.bandRole === 'ceiling') return 'SHORT';
  if (z.bandRole === 'floor') return 'LONG';
  return 'NEUTRAL';
}

function verdictToDirection(side: VolumeVerdictSide): 'LONG' | 'SHORT' | 'NEUTRAL' {
  if (side === 'LONG') return 'LONG';
  if (side === 'SHORT') return 'SHORT';
  return 'NEUTRAL';
}

function volumeZoneAtBar(
  pack: VolumeAiZonePack | null | undefined,
  last: Candle | null
): VolumeAiZone | null {
  if (!pack?.zones.length || !last) return null;
  const t = Number(last.time);
  let best: VolumeAiZone | null = pack.liveZone;
  for (const z of pack.zones) {
    if (z.timeFrom <= t && t <= z.timeTo) {
      if (!best || z.layer === 'cluster') best = z;
    }
  }
  return best;
}

function slotExpectedDirection(
  slot: Eagle1AiZoneSlot,
  executionDir: 'LONG' | 'SHORT' | null
): 'LONG' | 'SHORT' | 'NEUTRAL' {
  if (slot.side === 'entry') {
    return executionDir ?? 'NEUTRAL';
  }
  if (slot.side === 'support') return 'LONG';
  if (slot.side === 'resist') return 'SHORT';
  return 'NEUTRAL';
}

function slotHoldPct(slot: Eagle1AiZoneSlot): number | null {
  const pct = slot.liveHoldPct ?? slot.holdPct;
  return pct != null && Number.isFinite(pct) ? Math.round(pct) : null;
}

function dumpHintsFromZones(zones: MtfDumpZoneSpec[] | null | undefined): AiCandleDumpZoneHint[] {
  if (!zones?.length) return [];
  return zones.map((z) => ({
    top: z.top,
    bot: z.bot,
    mid: z.mid,
    lifeState: z.lifeState ?? null,
    bandRole: z.bandRole ?? null,
  }));
}

function volumeVerdictAtBar(pack: VolumeAiZonePack | null | undefined, last: Candle | null): string | null {
  if (!pack?.zones.length || !last) return null;
  const t = Number(last.time);
  for (const z of pack.zones) {
    if (z.timeFrom <= t && t <= z.timeTo) return verdictShortKo(z.verdictSide);
  }
  if (pack.liveZone && pack.liveZone.timeFrom <= t && t <= pack.liveZone.timeTo) {
    return verdictShortKo(pack.liveZone.verdictSide);
  }
  return null;
}

/** 마지막 봉 캔들 tone 변경 → 기록 */
export function scanCandleToneJournalEvents(params: {
  symbol: string;
  chartTf: string;
  candles: Candle[];
  price: number;
  activeTradePlan?: MergedDeskActiveTradePlan | null;
  practiceAi?: PracticeAiPlanPack | null;
  dumpZones?: MtfDumpZoneSpec[] | null;
  analyzeVerdict?: string | null;
  volumeAiZonePack?: VolumeAiZonePack | null;
  ctx?: DeskSignalContextInput | null;
}): TradeJournalEvent | null {
  const candles = params.candles;
  if (candles.length < 4) return null;
  const last = candles[candles.length - 1]!;
  const lastTime = Number(last.time);
  if (!(lastTime > 0)) return null;

  const toneMap = buildAiCandleToneByTime({
    candles,
    timeframe: params.chartTf,
    activeTradePlan: params.activeTradePlan ?? null,
    practiceAi: params.practiceAi ?? null,
    dumpZones: dumpHintsFromZones(params.dumpZones),
    analyzeVerdict: params.analyzeVerdict ?? null,
    planStatus: params.activeTradePlan?.status ?? null,
    planDirection:
      params.activeTradePlan?.direction === 'LONG' || params.activeTradePlan?.direction === 'SHORT'
        ? params.activeTradePlan.direction
        : null,
    planEntryAllowed: params.activeTradePlan?.entryAllowed,
    planEntry: params.activeTradePlan?.entry,
  });

  const tone = toneMap.get(lastTime) ?? 'none';
  if (tone === 'none') return null;

  const direction = toneToJournalDirection(tone);
  const signalId = createSignalId();
  const volKo = volumeVerdictAtBar(params.volumeAiZonePack, last);

  return recordWithContext(
    {
      symbol: params.symbol,
      chartTf: params.chartTf,
      kind: 'CANDLE_TONE',
      direction,
      price: params.price,
      levelPrice: Number(last.close) || params.price,
      levelLabel: toneKoShort(tone),
      noteKo: `캔들·${toneKoShort(tone)}${volKo ? ` · 거래량${volKo}` : ''}`,
      signalId,
      meta: {
        feature: 'candle_tone',
        tone,
        candleTime: lastTime,
        anchorPrice: Number(last.close) || params.price,
        volumeVerdictKo: volKo,
      },
    },
    params.ctx
  );
}

function scanOneAiZoneSlot(params: {
  symbol: string;
  chartTf: string;
  price: number;
  lastCandle: Candle;
  slot: Eagle1AiZoneSlot;
  executionDir: 'LONG' | 'SHORT' | null;
  approachRatio?: number;
  ctx?: DeskSignalContextInput | null;
}): TradeJournalEvent | null {
  const { slot, lastCandle } = params;
  const label = formatAiZoneSlotLabelKo(slot);
  const direction = slotExpectedDirection(slot, params.executionDir);
  const holdPct = slotHoldPct(slot);
  const mid = slot.mid;
  const touched = candleTouchesZone(lastCandle, slot.lower, slot.upper);
  const approached =
    !touched &&
    Math.abs(params.price - mid) / Math.max(mid, 1) <= (params.approachRatio ?? 0.0045);

  if (!touched && !approached) return null;

  const signalId = createSignalId();
  const base = {
    symbol: params.symbol,
    chartTf: params.chartTf,
    direction,
    price: params.price,
    levelPrice: mid,
    levelLabel: label,
    signalId,
    meta: {
      feature: 'ai_zone',
      zoneSide: slot.side,
      zoneRole: slot.role,
      labelKo: label,
      holdPct,
      sampleN: slot.sampleN,
      clusterId: slot.clusterId,
      candleTime: Number(lastCandle.time),
      anchorPrice: params.price,
      levelTop: slot.upper,
      levelBot: slot.lower,
    },
  };

  if (touched) {
    return recordWithContext(
      {
        ...base,
        kind: 'AI_ZONE_TOUCH',
        noteKo: `AI ZONE·${label} · 터치`,
      },
      params.ctx
    );
  }
  return recordWithContext(
    {
      ...base,
      kind: 'AI_ZONE_APPROACH',
      noteKo: `AI ZONE·${label} · 접근`,
    },
    params.ctx
  );
}

/** Eagle1 AI ZONE % — 터치·접근 기록 */
export function scanAiZoneJournalTouches(params: {
  symbol: string;
  chartTf: string;
  price: number;
  lastCandle?: Candle | null;
  aiZonePack?: Eagle1AiZonePack | null;
  approachRatio?: number;
  ctx?: DeskSignalContextInput | null;
}): TradeJournalEvent[] {
  const pack = params.aiZonePack;
  const last = params.lastCandle;
  if (!pack || !last || !(params.price > 0)) return [];

  const execDir = pack.execution.direction;
  const slots = [pack.activeSupport, pack.ghostResist, pack.entry].filter(
    (s): s is Eagle1AiZoneSlot => s != null
  );
  const out: TradeJournalEvent[] = [];
  for (const slot of slots) {
    const ev = scanOneAiZoneSlot({
      symbol: params.symbol,
      chartTf: params.chartTf,
      price: params.price,
      lastCandle: last,
      slot,
      executionDir: execDir,
      approachRatio: params.approachRatio,
      ctx: params.ctx,
    });
    if (ev) out.push(ev);
  }
  return out;
}

/** AI200 CONFIRM_ENTRY → 기록 (1회) */
export function recordAi200ConfirmJournal(params: {
  symbol: string;
  chartTf: string;
  sourceTf: string;
  pack: Scalp200PlanPack;
  price: number;
}): TradeJournalEvent | null {
  const { pack } = params;
  if (pack.zoneLife?.lifeState !== 'CONFIRM_ENTRY') return null;
  if (pack.direction === 'NEUTRAL' || !(pack.entry > 0)) return null;

  const signalId = createSignalId();
  const dirKo = pack.direction === 'LONG' ? '롱' : '숏';
  return appendTradeJournalEvent({
    symbol: params.symbol,
    chartTf: params.chartTf,
    sourceTf: params.sourceTf,
    kind: 'AI200_CONFIRM',
    direction: pack.direction,
    price: params.price,
    levelPrice: pack.entry,
    levelLabel: 'AI200',
    noteKo: `AI200·확정 · ${dirKo} · E${pack.entry.toFixed(1)}`,
    signalId,
    meta: {
      feature: 'ai200',
      entry: pack.entry,
      stopLoss: pack.stopLoss,
      tp1: pack.tp1,
      tp2: pack.tp2,
      tp3: pack.tp3,
      rr: pack.rr,
      leverage: pack.actualLeverage,
      aiScore: pack.zoneLife?.aiScore ?? null,
      gatesPassed: pack.gatesPassed,
      gatesTotal: pack.gatesTotal,
      rsi: pack.zoneLife?.rsi ?? null,
      macdHist: pack.zoneLife?.macdHist ?? null,
      anchorPrice: params.price,
      candleTime: null,
    },
  });
}

function outcomeMeta(
  signal: TradeJournalEvent,
  snap: ReturnType<typeof computeForwardOutcome>,
  bars: OutcomeHorizon
): Record<string, string | number | boolean | null> {
  if (!snap) return {};
  return {
    feature: signal.meta?.feature ?? null,
    bars,
    closeDeltaPct: Math.round(snap.closeDeltaPct * 100) / 100,
    maxUpPct: Math.round(snap.maxUpPct * 100) / 100,
    maxDownPct: Math.round(snap.maxDownPct * 100) / 100,
    directionHit: snap.directionHit,
    hitTp: snap.hitTp,
    hitSl: snap.hitSl,
    sourceKind: signal.kind,
    holdPct: signal.meta?.holdPct ?? null,
    tone: signal.meta?.tone ?? null,
    confluenceScore: signal.meta?.confluenceScore ?? null,
    confluenceAligned: signal.meta?.confluenceAligned ?? null,
    confluenceLong: signal.meta?.confluenceLong ?? null,
    confluenceShort: signal.meta?.confluenceShort ?? null,
    sessionKo: signal.meta?.sessionKo ?? null,
    rsi: signal.meta?.rsi ?? null,
    macdHist: signal.meta?.macdHist ?? null,
    featOn: signal.meta?.featOn ?? null,
    dumpBoard: signal.meta?.dumpBoard ?? null,
    fpHash: signal.meta?.fpHash ?? null,
    learningSchema: signal.meta?.learningSchema ?? null,
    /** 반등(상방) / 하락(하방) 어디까지 — 도달 학습용 */
    reachUpPct: Math.round(snap.maxUpPct * 100) / 100,
    reachDownPct: Math.round(snap.maxDownPct * 100) / 100,
  };
}

/** 봉당 1회 — 켜진 기능·합류·폭락보드 스냅샷 (유사도 학습용) */
export function scanDeskLearningConfluenceSnapshot(params: {
  symbol: string;
  chartTf: string;
  price: number;
  lastCandle: Candle | null;
  ctx: DeskSignalContextInput;
  flags?: DeskLearningFeatureFlags | null;
  doksuriMeta?: {
    factHash?: string | null;
    dominantSide?: string | null;
    bigMoneyState?: string | null;
  } | null;
}): TradeJournalEvent | null {
  const last = params.lastCandle;
  if (!last || !(params.price > 0)) return null;
  const meta = buildDeskLearningSnapshotMeta(params.ctx, params.flags, params.doksuriMeta);
  if (meta.candleTime == null) meta.candleTime = Number(last.time);
  const direction = learningSnapshotDirection(meta);
  const signalId = createSignalId();
  const longN = Number(meta.confluenceLong) || 0;
  const shortN = Number(meta.confluenceShort) || 0;
  const noteKo = [
    '학습스냅샷',
    meta.featOn ? `기능[${meta.featOn}]` : null,
    meta.confluenceKo ? `합류 ${meta.confluenceKo}` : `L${longN}/S${shortN}`,
    meta.dumpBoard ? `폭락 ${String(meta.dumpBoard).slice(0, 48)}` : null,
  ]
    .filter(Boolean)
    .join(' · ')
    .slice(0, 160);

  return appendTradeJournalEvent({
    symbol: params.symbol,
    chartTf: params.chartTf,
    kind: 'CONFLUENCE_SNAPSHOT',
    direction,
    price: params.price,
    levelPrice: params.price,
    levelLabel: '데스크 학습스냅샷',
    noteKo,
    signalId,
    meta: {
      ...meta,
      candleTime: Number(last.time),
      anchorPrice: params.price,
    },
  });
}

function tpSlFromSignal(signal: TradeJournalEvent): { tp?: number; sl?: number } {
  const tp = Number(signal.meta?.tp1);
  const sl = Number(signal.meta?.stopLoss);
  return {
    tp: Number.isFinite(tp) && tp > 0 ? tp : undefined,
    sl: Number.isFinite(sl) && sl > 0 ? sl : undefined,
  };
}

/** pending 신호 → N봉 결과 자동 기록 */
export function scanPendingSignalOutcomes(params: {
  symbol: string;
  chartTf: string;
  candles: Candle[];
}): TradeJournalEvent[] {
  const { candles, symbol, chartTf } = params;
  if (candles.length < 6) return [];

  const rows = readTradeEventJournal().filter(
    (e) =>
      e.symbol.toUpperCase() === symbol.toUpperCase() &&
      e.chartTf === chartTf &&
      e.signalId &&
      TRADE_JOURNAL_OUTCOME_SOURCE_KINDS.includes(e.kind)
  );
  if (!rows.length) return [];

  const existing = new Set(
    readTradeEventJournal()
      .filter((e) => e.signalId && TRADE_JOURNAL_OUTCOME_KINDS.includes(e.kind))
      .map((e) => `${e.signalId}|${e.kind}`)
  );

  const out: TradeJournalEvent[] = [];
  for (const signal of rows) {
    const candleTime = Number(signal.meta?.candleTime);
    const anchorPrice = Number(signal.meta?.anchorPrice ?? signal.price);
    if (!(anchorPrice > 0)) continue;

    let anchorIdx = candleTime > 0 ? findCandleIndexByTime(candles, candleTime) : -1;
    if (anchorIdx < 0) {
      anchorIdx = candles.length - 2;
    }
    if (anchorIdx < 0) continue;

    const { tp, sl } = tpSlFromSignal(signal);

    for (const bars of OUTCOME_BAR_HORIZONS) {
      const kind = outcomeKindForHorizon(bars);
      const key = `${signal.signalId}|${kind}`;
      if (existing.has(key)) continue;

      const snap = computeForwardOutcome({
        candles,
        anchorIdx,
        anchorPrice,
        direction: signal.direction,
        bars,
        tpPrice: tp,
        slPrice: sl,
      });
      if (!snap) continue;

      const ev = appendTradeJournalEvent({
        symbol,
        chartTf,
        kind,
        direction: signal.direction,
        price: Number(candles[Math.min(anchorIdx + bars, candles.length - 1)]!.close) || anchorPrice,
        levelPrice: anchorPrice,
        levelLabel: `${bars}봉 결과`,
        noteKo: `${signal.levelLabel} · ${bars}봉 · ${snap.directionHit ? '방향일치' : '방향불일치'} · Δ${snap.closeDeltaPct.toFixed(2)}%`,
        signalId: signal.signalId,
        meta: outcomeMeta(signal, snap, bars),
      });
      existing.add(key);
      out.push(ev);
    }
  }
  return out;
}

/** MTF 폭락구간 — 터치·lifeState 변경 */
export function scanDumpZoneJournalEvents(params: {
  symbol: string;
  chartTf: string;
  price: number;
  lastCandle?: Candle | null;
  dumpZones?: MtfDumpZoneSpec[] | null;
  ctx?: DeskSignalContextInput | null;
}): TradeJournalEvent[] {
  const last = params.lastCandle;
  const zones = params.dumpZones;
  if (!last || !zones?.length || !(params.price > 0)) return [];

  const out: TradeJournalEvent[] = [];
  const lastTime = Number(last.time);

  for (const z of zones) {
    const dumpKey = `${params.symbol}|${mtfDumpSlotKey(z)}|${z.mid.toFixed(1)}`;
    const lifeState = z.lifeState ?? 'WATCH';
    const prevLife = dumpLifeMem.get(dumpKey);
    if (prevLife !== lifeState) {
      dumpLifeMem.set(dumpKey, lifeState);
      if (prevLife != null) {
        const dir = dumpExpectedDirection(z);
        out.push(
          appendTradeJournalEvent({
            symbol: params.symbol,
            chartTf: params.chartTf,
            sourceTf: z.sourceTf,
            kind: 'DUMP_LIFE_CHANGE',
            direction: dir,
            price: params.price,
            levelPrice: z.mid,
            levelLabel: `${z.sourceTfKo || z.sourceTf} ${DUMP_LIFE_KO[lifeState]}`,
            noteKo: `폭락·${z.labelKo} · ${DUMP_LIFE_KO[lifeState]}`,
            meta: {
              feature: 'dump',
              dumpKey,
              zoneId: dumpZoneStableId({
                symbol: params.symbol,
                sourceTf: z.sourceTf,
                bandRole: z.bandRole,
                top: z.top,
                bot: z.bot,
              }),
              lifeState,
              bandRole: z.bandRole ?? null,
              reachPct: z.reachPct ?? null,
              reachSample: z.reachSample ?? null,
              evidenceScore: z.evidenceScore ?? null,
              levelTop: z.top,
              levelBot: z.bot,
            },
          })
        );
      }
    }

    const touched = candleTouchesZone(last, z.bot, z.top);
    if (!touched) continue;

    const direction = dumpExpectedDirection(z);
    const signalId = createSignalId();
    out.push(
      recordWithContext(
        {
          symbol: params.symbol,
          chartTf: params.chartTf,
          sourceTf: z.sourceTf,
          kind: 'DUMP_ZONE_TOUCH',
          direction,
          price: params.price,
          levelPrice: z.mid,
          levelLabel: z.labelKo,
          noteKo: `폭락·${z.labelKo} · 터치 · ${DUMP_LIFE_KO[lifeState]}`,
          signalId,
          meta: {
            feature: 'dump',
            dumpKey,
            zoneId: dumpZoneStableId({
              symbol: params.symbol,
              sourceTf: z.sourceTf,
              bandRole: z.bandRole,
              top: z.top,
              bot: z.bot,
            }),
            lifeState,
            bandRole: z.bandRole ?? null,
            reachPct: z.reachPct ?? null,
            reachSample: z.reachSample ?? null,
            candleTime: lastTime,
            anchorPrice: params.price,
            levelTop: z.top,
            levelBot: z.bot,
          },
        },
        params.ctx
      )
    );
  }
  return out;
}

/** 기관밴드 ST — LH★/SH◆ 터치 (최근 봉) */
export function scanInstBandJournalTouches(params: {
  symbol: string;
  chartTf: string;
  price: number;
  candles: Candle[];
  analysis?: AnalyzeResponse | null;
  ctx?: DeskSignalContextInput | null;
}): TradeJournalEvent[] {
  const safe = sanitizeChartCandlesForSeries(params.candles, params.chartTf);
  if (safe.length < 7 || !(params.price > 0)) return [];

  const marks = computeInstitutionalBandInteractionMarkersUnion(
    safe,
    INSTITUTIONAL_BAND_DEFAULT_PERIOD,
    INSTITUTIONAL_BAND_DEFAULT_MULT,
    {
      minBarsBetween: institutionalBandTouchMinGapBars(params.chartTf),
      tierEnabled: { A: true, B: true, C: true },
      overlays: params.analysis?.overlays ?? [],
    }
  );

  const lastTime = Number(safe[safe.length - 1]!.time);
  const recent = marks.filter((m) => Number(m.time) === lastTime);
  const out: TradeJournalEvent[] = [];

  for (const m of recent) {
    const tierKo = m.tier === 'A' ? '강' : m.tier === 'B' ? '중' : '약';
    const label = m.verdict === 'LONG' ? `LH★·롱ST${tierKo}` : `SH◆·숏ST${tierKo}`;
    const signalId = createSignalId();
    out.push(
      recordWithContext(
        {
          symbol: params.symbol,
          chartTf: params.chartTf,
          kind: 'INST_BAND_TOUCH',
          direction: m.verdict,
          price: params.price,
          levelPrice: params.price,
          levelLabel: label,
          noteKo: `기관밴드·${label}`,
          signalId,
          meta: {
            feature: 'inst_band',
            bandVerdict: m.verdict,
            tier: m.tier,
            score: m.score,
            proximityAtr: Math.round(m.proximityAtr * 100) / 100,
            confluenceGrade: m.confluence?.grade ?? null,
            candleTime: lastTime,
            anchorPrice: params.price,
          },
        },
        params.ctx
      )
    );
  }
  return out;
}

/** 거래량 AI — 구간 verdict (롱/숏/관망) */
export function scanVolumeVerdictJournalEvents(params: {
  symbol: string;
  chartTf: string;
  price: number;
  lastCandle?: Candle | null;
  volumeAiZonePack?: VolumeAiZonePack | null;
  ctx?: DeskSignalContextInput | null;
}): TradeJournalEvent | null {
  const last = params.lastCandle;
  const zone = volumeZoneAtBar(params.volumeAiZonePack, last ?? null);
  if (!last || !zone) return null;

  const direction = verdictToDirection(zone.verdictSide);
  const signalId = createSignalId();
  const sideKo = verdictShortKo(zone.verdictSide);

  return recordWithContext(
    {
      symbol: params.symbol,
      chartTf: params.chartTf,
      kind: 'VOL_VERDICT',
      direction,
      price: params.price,
      levelPrice: params.price,
      levelLabel: `${zone.segNo ?? ''}${sideKo}·거래량`,
      noteKo: `거래량·${zone.plainShortKo || sideKo} · RVOL${zone.avgRvol.toFixed(1)}`,
      signalId,
      meta: {
        feature: 'volume',
        verdictSide: zone.verdictSide,
        segNo: zone.segNo ?? null,
        layer: zone.layer,
        buyPct: Math.round(zone.buyPct),
        sellPct: Math.round(zone.sellPct),
        avgRvol: Math.round(zone.avgRvol * 10) / 10,
        volVsPastPct: Math.round(zone.volVsPastPct),
        candleTime: Number(last.time),
        anchorPrice: params.price,
      },
    },
    params.ctx
  );
}

/** 파랑빨강띠 — 통로 side·레일 터치 */
export function scanRbCorridorJournalEvents(params: {
  symbol: string;
  chartTf: string;
  price: number;
  lastCandle?: Candle | null;
  corridorPaint?: MergedDeskRbCorridorPaint | null;
  rbStance?: MergedDeskRbMasterStance | null;
  rbLiveHub?: MergedDeskRbLiveEntryHub | null;
  ctx?: DeskSignalContextInput | null;
}): TradeJournalEvent[] {
  const out: TradeJournalEvent[] = [];
  const paint = params.corridorPaint;
  const stance = params.rbStance;
  const hub = params.rbLiveHub;
  const last = params.lastCandle;
  if (!(params.price > 0)) return out;

  const side =
    paint?.side === 'long'
      ? 'LONG'
      : paint?.side === 'short'
        ? 'SHORT'
        : stance?.side && stance.side !== 'WAIT'
          ? stance.side
          : hub?.side && hub.side !== 'WAIT'
            ? hub.side
            : 'NEUTRAL';

  const corridorKey = [
    params.symbol,
    params.chartTf,
    paint?.side ?? '',
    paint?.trigger ?? '',
    stance?.side ?? '',
    stance?.phaseKo ?? '',
  ].join('|');

  const prevKey = rbCorridorMem.get(`${params.symbol}|${params.chartTf}`);
  if (side !== 'NEUTRAL' && corridorKey !== prevKey) {
    rbCorridorMem.set(`${params.symbol}|${params.chartTf}`, corridorKey);
    const signalId = createSignalId();
    const sideKo = side === 'LONG' ? '롱통로' : '숏통로';
    out.push(
      recordWithContext(
        {
          symbol: params.symbol,
          chartTf: params.chartTf,
          kind: 'RB_CORRIDOR',
          direction: side,
          price: params.price,
          levelPrice: params.price,
          levelLabel: sideKo,
          noteKo: `파랑빨강·${sideKo}${paint?.summaryKo ? ` · ${paint.summaryKo}` : ''}`,
          signalId,
          meta: {
            feature: 'rb_corridor',
            corridorKey,
            corridorSide: paint?.side ?? null,
            trigger: paint?.trigger ?? null,
            atSupport: paint?.atSupport ?? false,
            atResist: paint?.atResist ?? false,
            stanceSide: stance?.side ?? null,
            stancePhaseKo: stance?.phaseKo ?? null,
            hubActionKo: hub?.actionKo ?? null,
            candleTime: last ? Number(last.time) : null,
            anchorPrice: params.price,
          },
        },
        params.ctx
      )
    );
  }

  if (paint && last && (paint.atSupport || paint.atResist)) {
    const railDir: 'LONG' | 'SHORT' = paint.atSupport ? 'LONG' : 'SHORT';
    const signalId = createSignalId();
    out.push(
      recordWithContext(
        {
          symbol: params.symbol,
          chartTf: params.chartTf,
          kind: 'RB_RAIL_TOUCH',
          direction: railDir,
          price: params.price,
          levelPrice: params.price,
          levelLabel: paint.atSupport ? '하단레일·지지' : '상단레일·저항',
          noteKo: `파랑빨강·${paint.atSupport ? '하단레일 터치' : '상단레일 터치'}`,
          signalId,
          meta: {
            feature: 'rb_corridor',
            atSupport: paint.atSupport,
            atResist: paint.atResist,
            corridorSide: paint.side,
            trigger: paint.trigger,
            candleTime: Number(last.time),
            anchorPrice: params.price,
          },
        },
        params.ctx
      )
    );
  }

  return out;
}

/** Phase1+2 통합 스캔 — desk tick마다 1회 */
export function scanMergedDeskSignalJournal(params: {
  symbol: string;
  chartTf: string;
  candles: Candle[];
  price: number;
  aiZonePack?: Eagle1AiZonePack | null;
  activeTradePlan?: MergedDeskActiveTradePlan | null;
  practiceAi?: PracticeAiPlanPack | null;
  dumpZones?: MtfDumpZoneSpec[] | null;
  analyzeVerdict?: string | null;
  volumeAiZonePack?: VolumeAiZonePack | null;
  scalp200Plan?: Scalp200PlanPack | null;
  scalp200SourceTf?: string;
  analysis?: AnalyzeResponse | null;
  corridorPaint?: MergedDeskRbCorridorPaint | null;
  rbStance?: MergedDeskRbMasterStance | null;
  rbLiveHub?: MergedDeskRbLiveEntryHub | null;
  institutionalBandOn?: boolean;
  blueRedChannelsOn?: boolean;
  mtfDumpOn?: boolean;
  masterFutures?: MasterFuturesDecision | null;
  learningFlags?: DeskLearningFeatureFlags | null;
  doksuriMeta?: {
    factHash?: string | null;
    dominantSide?: string | null;
    bigMoneyState?: string | null;
  } | null;
}): TradeJournalEvent[] {
  const last = params.candles[params.candles.length - 1] ?? null;
  const out: TradeJournalEvent[] = [];

  const ctxInput: DeskSignalContextInput = {
    symbol: params.symbol,
    chartTf: params.chartTf,
    candles: params.candles,
    price: params.price,
    analyzeVerdict: params.analyzeVerdict,
    analysis: params.analysis,
    activeTradePlan: params.activeTradePlan,
    practiceAi: params.practiceAi,
    masterFutures: params.masterFutures,
    aiZonePack: params.aiZonePack,
    volumeAiZonePack: params.volumeAiZonePack,
    dumpZones: params.dumpZones,
    corridorPaint: params.corridorPaint,
    rbStance: params.rbStance,
    rbLiveHub: params.rbLiveHub,
    scalp200Plan: params.scalp200Plan,
  };

  const flags: DeskLearningFeatureFlags = {
    mtfDumpOn: params.mtfDumpOn !== false,
    institutionalBandOn: params.institutionalBandOn !== false,
    blueRedChannelsOn: params.blueRedChannelsOn !== false,
    scalp200On: Boolean(params.scalp200Plan) || Boolean(params.learningFlags?.scalp200On),
    practiceAiOn: params.learningFlags?.practiceAiOn,
    aiZoneOn: params.learningFlags?.aiZoneOn ?? Boolean(params.aiZonePack),
    volumeAiOn: params.learningFlags?.volumeAiOn ?? Boolean(params.volumeAiZonePack),
    whaleDnaOn: params.learningFlags?.whaleDnaOn,
  };

  /** 학습 스냅샷 먼저 — N봉 OUTCOME 연결 */
  const learnEv = scanDeskLearningConfluenceSnapshot({
    symbol: params.symbol,
    chartTf: params.chartTf,
    price: params.price,
    lastCandle: last,
    ctx: ctxInput,
    flags,
    doksuriMeta: params.doksuriMeta,
  });
  if (learnEv) out.push(learnEv);

  out.push(...scanSignalJournalReinforce(ctxInput));

  const toneEv = scanCandleToneJournalEvents({
    symbol: params.symbol,
    chartTf: params.chartTf,
    candles: params.candles,
    price: params.price,
    activeTradePlan: params.activeTradePlan,
    practiceAi: params.practiceAi,
    dumpZones: params.dumpZones,
    analyzeVerdict: params.analyzeVerdict,
    volumeAiZonePack: params.volumeAiZonePack,
    ctx: ctxInput,
  });
  if (toneEv) out.push(toneEv);

  if (last) {
    out.push(
      ...scanAiZoneJournalTouches({
        symbol: params.symbol,
        chartTf: params.chartTf,
        price: params.price,
        lastCandle: last,
        aiZonePack: params.aiZonePack,
        ctx: ctxInput,
      })
    );
  }

  if (params.scalp200Plan && params.scalp200SourceTf) {
    const ai200 = recordAi200ConfirmJournal({
      symbol: params.symbol,
      chartTf: params.chartTf,
      sourceTf: params.scalp200SourceTf,
      pack: params.scalp200Plan,
      price: params.price,
    });
    if (ai200) out.push(ai200);
  }

  if (params.mtfDumpOn !== false && last) {
    out.push(
      ...scanDumpZoneJournalEvents({
        symbol: params.symbol,
        chartTf: params.chartTf,
        price: params.price,
        lastCandle: last,
        dumpZones: params.dumpZones,
        ctx: ctxInput,
      })
    );
  }

  if (params.institutionalBandOn !== false) {
    out.push(
      ...scanInstBandJournalTouches({
        symbol: params.symbol,
        chartTf: params.chartTf,
        price: params.price,
        candles: params.candles,
        analysis: params.analysis,
        ctx: ctxInput,
      })
    );
  }

  if (last && params.volumeAiZonePack) {
    const volEv = scanVolumeVerdictJournalEvents({
      symbol: params.symbol,
      chartTf: params.chartTf,
      price: params.price,
      lastCandle: last,
      volumeAiZonePack: params.volumeAiZonePack,
      ctx: ctxInput,
    });
    if (volEv) out.push(volEv);
  }

  if (params.blueRedChannelsOn !== false) {
    out.push(
      ...scanRbCorridorJournalEvents({
        symbol: params.symbol,
        chartTf: params.chartTf,
        price: params.price,
        lastCandle: last,
        corridorPaint: params.corridorPaint,
        rbStance: params.rbStance,
        rbLiveHub: params.rbLiveHub,
        ctx: ctxInput,
      })
    );
  }

  out.push(
    ...scanPendingSignalOutcomes({
      symbol: params.symbol,
      chartTf: params.chartTf,
      candles: params.candles,
    })
  );

  return out;
}

/** 기록부 JSON — 신호별 결과 요약 (조건부) — v3 analytics 위임 */
export function summarizeSignalJournalAccuracy(symbol: string, chartTf?: string) {
  const a = buildSignalJournalAnalytics(symbol, chartTf);
  return {
    totalSignals: a.totalSignals,
    withOutcome: a.withOutcome12,
    directionHitPct: a.directionHitPct12,
    byFeature: a.byFeature,
    byHoldPct: a.byHoldPct,
    byConfluenceScore: a.byConfluenceScore,
    bySession: a.bySession,
    byConfluenceAligned: a.byConfluenceAligned,
  };
}
