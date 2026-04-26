/**
 * SMC 데스크 · 합성 모드: ON인 차트 레이어만 반영한 컨플루언스·시나리오·워치 규칙·플랜 요약.
 * 확정 매매·고정 승률 아님. 리플레이는 엔진 재분석 없이 선택 봉 종가로 근사.
 */
import type { AnalyzeResponse } from '@/types';
import type { Candle } from '@/types';

export type SmcDeskCompositeLayerMask = {
  showStructure: boolean;
  showZones: boolean;
  showChartPrimeTrendChannels: boolean;
  showScenario: boolean;
  showWhaleZone: boolean;
  showRsi: boolean;
};

export type SmcDeskCompositeModel = {
  confluenceScore: number;
  confluenceMax: number;
  tags: string[];
  longScenario: { invalidation: string; nextCheck: string };
  shortScenario: { invalidation: string; nextCheck: string };
  tradePlan: {
    direction: 'LONG' | 'SHORT' | 'WATCH';
    entry: number | null;
    stopLoss: number | null;
    targets: [number | null, number | null, number | null];
    layerNotes: { entry?: string; sl?: string; tp?: string };
  };
  htfStrip: string[];
  watchRules: Array<{ id: string; label: string; matched: boolean }>;
  depthDelta: {
    regime: 'buy' | 'sell' | 'neutral';
    flip: 'up' | 'down' | 'none';
    strength: number;
    smoothedPct: number;
    persistenceBars: number;
    trapLong: boolean;
    trapShort: boolean;
    seriesPct: number[];
  } | null;
  replayNote: string | null;
};

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

export function buildSmcDeskCompositeModel(
  analysis: AnalyzeResponse | null,
  layers: SmcDeskCompositeLayerMask,
  candles: Candle[],
  options?: {
    replayBarOffset?: number;
    depthDeltaRegimeFilter?: boolean;
    depthDeltaAlignmentWeight?: boolean;
    depthDeltaTpAdaptive?: boolean;
  }
): SmcDeskCompositeModel {
  const off = Math.max(0, Math.floor(options?.replayBarOffset ?? 0));
  const n = candles.length;
  const idx = n > 0 ? clamp(n - 1 - off, 0, n - 1) : 0;
  const ref = n > 0 ? candles[idx] : null;
  const refClose = ref?.close ?? null;
  const replayNote =
    off > 0
      ? `리플레이: ${off}봉 전 종가 기준 근사(엔진·aiFusion은 최신봉 분석 그대로).`
      : null;
  const ddFilterOn = options?.depthDeltaRegimeFilter !== false;
  const ddWeightOn = options?.depthDeltaAlignmentWeight !== false;
  const ddTpOn = options?.depthDeltaTpAdaptive !== false;

  if (!analysis || refClose == null || !Number.isFinite(refClose)) {
    return {
      confluenceScore: 0,
      confluenceMax: 100,
      tags: [],
      longScenario: {
        invalidation: '데이터 부족',
        nextCheck: '분석 로드 후 확인',
      },
      shortScenario: {
        invalidation: '데이터 부족',
        nextCheck: '분석 로드 후 확인',
      },
      tradePlan: {
        direction: 'WATCH',
        entry: null,
        stopLoss: null,
        targets: [null, null, null],
        layerNotes: {},
      },
      htfStrip: [],
      watchRules: [],
      depthDelta: null,
      replayNote,
    };
  }

  const cs = analysis.confirmedSignal;
  const af = analysis.aiFusionSignal;
  const rsiDiv = analysis.rsiDivergenceSignal;
  const smcLs = analysis.smcDeskConfluenceLs;
  const mtf = analysis.mtf;
  const dd = analysis.depthDeltaContext ?? null;

  let acc = 0;
  const tags: string[] = [];

  const wStruct = 18;
  const wZone = 18;
  const wCh = 16;
  const wScen = 10;
  const wWhale = 14;
  const wRsi = 12;
  const wDiv = 12;

  if (layers.showStructure) {
    const ok = Boolean(cs?.structure) || Boolean(analysis.structureRocketSignals?.length);
    if (ok) {
      acc += wStruct;
      tags.push('구조(BOS/CHOCH·로켓)');
    }
  }
  if (layers.showZones) {
    const nearSup =
      analysis.nearestSupportOb &&
      refClose <= analysis.nearestSupportOb.high + Math.max(refClose * 0.0006, 1e-8) &&
      refClose >= analysis.nearestSupportOb.low - Math.max(refClose * 0.0006, 1e-8);
    const nearRes =
      analysis.nearestResistanceOb &&
      refClose <= analysis.nearestResistanceOb.high + Math.max(refClose * 0.0006, 1e-8) &&
      refClose >= analysis.nearestResistanceOb.low - Math.max(refClose * 0.0006, 1e-8);
    if (nearSup || nearRes || cs?.fvgZone) {
      acc += wZone;
      if (nearSup) tags.push('수요·지지 OB 근접');
      if (nearRes) tags.push('공급·저항 OB 근접');
      if (cs?.fvgZone) tags.push('FVG 조건');
    }
  }
  if (layers.showChartPrimeTrendChannels) {
    if (smcLs) {
      acc += wCh;
      tags.push('채널·LinReg 합류');
    }
  }
  if (layers.showScenario) {
    if (analysis.bullishScenario || analysis.bearishScenario || analysis.nextTargets?.length) {
      acc += wScen;
      tags.push('시나리오·타깃 문구');
    }
  }
  if (layers.showWhaleZone) {
    const wz = analysis.volumeWhaleZoneConfluence;
    if (wz && (wz.lastBarInBuyZone || wz.lastBarInSellZone || wz.confluentLong || wz.confluentShort)) {
      acc += wWhale;
      tags.push('고래·호가 존');
    }
  }
  if (layers.showRsi) {
    if (cs?.rsi) {
      acc += wRsi;
      tags.push('RSI 조건');
    }
  }
  if (rsiDiv?.divergence && (rsiDiv.divergence.bullish || rsiDiv.divergence.bearish)) {
    acc += wDiv;
    if (rsiDiv.divergence.bullish) tags.push('RSI 다이버(강세)');
    if (rsiDiv.divergence.bearish) tags.push('RSI 다이버(약세)');
  }

  if (af?.confidence != null && af.confidence > 0) {
    acc += clamp((af.confidence / 100) * 22, 0, 22);
  }
  if (ddWeightOn && dd?.regime === 'buy') {
    acc += 4 + Math.round((dd.strength ?? 0) * 7);
    tags.push(`Δ유동성 매수(${dd.smoothedPct.toFixed(1)}%)`);
  } else if (ddWeightOn && dd?.regime === 'sell') {
    acc += 4 + Math.round((dd.strength ?? 0) * 7);
    tags.push(`Δ유동성 매도(${dd.smoothedPct.toFixed(1)}%)`);
  }

  const confluenceScore = Math.round(clamp(acc, 0, 100));

  const invL =
    analysis.invalidationLevel != null
      ? `무효화 참고: ${analysis.invalidationLevel.price.toFixed(4)} (${analysis.invalidationLevel.reason || 'invalidation'})`
      : analysis.supportLevel != null
        ? `직전 지지 ${analysis.supportLevel.price.toFixed(4)} 이탈 시 롱 시나리오 약화`
        : '차트 스윙 저점 이탈·구조 전환 시 롱 시나리오 재검토';
  const invS =
    analysis.invalidationLevel != null
      ? `무효화 참고: ${analysis.invalidationLevel.price.toFixed(4)}`
      : analysis.resistanceLevel != null
        ? `직전 저항 ${analysis.resistanceLevel.price.toFixed(4)} 상향 돌파 시 숏 시나리오 약화`
        : '차트 스윙 고점 상향 돌파·구조 전환 시 숏 시나리오 재검토';

  const longScenario = {
    invalidation: invL,
    nextCheck: analysis.mustBreak || analysis.mustHold || '다음 봉 종가·OB 재터치 여부',
  };
  const shortScenario = {
    invalidation: invS,
    nextCheck: analysis.mustReclaimCloseLevel != null ? `종가 ${analysis.mustReclaimCloseLevel.toFixed(2)} 재탈환 여부` : '저항 재거절·종가 확인',
  };

  const lp = analysis.lsSignalPlan;
  const fr = analysis.frontRunSignal;
  const baseDir: 'LONG' | 'SHORT' | 'WATCH' =
    lp?.direction ?? (fr?.direction === 'LONG' || fr?.direction === 'SHORT' ? fr.direction : analysis.verdict);
  const dir: 'LONG' | 'SHORT' | 'WATCH' = baseDir === 'LONG' || baseDir === 'SHORT' ? baseDir : 'WATCH';
  let entry: number | null = null;
  let stopLoss: number | null = null;
  let targets: [number | null, number | null, number | null] = [null, null, null];
  const layerNotes: { entry?: string; sl?: string; tp?: string } = {};

  if (lp) {
    entry = lp.entry;
    stopLoss = lp.stopLoss;
    targets = [lp.targets[0], lp.targets[1], lp.targets[2]];
    layerNotes.entry = 'lsSignalPlan';
    layerNotes.sl = 'lsSignalPlan';
    layerNotes.tp = 'lsSignalPlan TP1~3';
    if (lp.structureNote) {
      layerNotes.entry = `lsSignalPlan · ${lp.structureNote}`;
    }
  } else if (fr && fr.state === 'TRIGGERED' && fr.entry != null) {
    entry = fr.entry;
    stopLoss = fr.stop ?? null;
    targets = [fr.tp1 ?? null, fr.tp2 ?? null, fr.tp3 ?? null];
    layerNotes.entry = '선반영 트리거';
    layerNotes.sl = fr.stop != null ? '선반영 SL' : undefined;
    layerNotes.tp = '선반영 TP';
  } else {
    layerNotes.entry = '신호 플랜 없음 — 레이어·시나리오만 참고';
  }

  // 유동성 델타 강도 기반 TP/SL 미세 조정 (합성 모드 작도 전용).
  if (ddTpOn && dir !== 'WATCH' && entry != null && stopLoss != null && dd) {
    const aligned =
      (dir === 'LONG' && dd.regime === 'buy') || (dir === 'SHORT' && dd.regime === 'sell');
    const contra =
      (dir === 'LONG' && dd.regime === 'sell') || (dir === 'SHORT' && dd.regime === 'buy');
    const s = Math.max(0, Math.min(1, dd.strength ?? 0));
    if (aligned && s >= 0.45) {
      const extend = 1 + s * 0.22;
      targets = targets.map((tp) => (tp == null ? null : entry + (tp - entry) * extend)) as [
        number | null,
        number | null,
        number | null,
      ];
      layerNotes.tp = `${layerNotes.tp || 'TP'} · Δ정렬 확장 x${extend.toFixed(2)}`;
    } else if (contra && s >= 0.35) {
      const reduce = 1 - Math.min(0.28, s * 0.25);
      targets = targets.map((tp) => (tp == null ? null : entry + (tp - entry) * reduce)) as [
        number | null,
        number | null,
        number | null,
      ];
      stopLoss = entry + (stopLoss - entry) * (1 - Math.min(0.18, s * 0.16));
      layerNotes.tp = `${layerNotes.tp || 'TP'} · Δ역행 보수 x${reduce.toFixed(2)}`;
      layerNotes.sl = `${layerNotes.sl || 'SL'} · Δ역행 보수`;
    }
  }

  const htfStrip: string[] = [];
  if (mtf?.summary) htfStrip.push(mtf.summary);
  if (mtf?.htfBias) htfStrip.push(`HTF: ${mtf.htfBias}`);
  if (mtf?.mtfBias) htfStrip.push(`MTF: ${mtf.mtfBias}`);
  const engTrend =
    analysis.engine && typeof (analysis.engine as { trend?: string }).trend === 'string'
      ? (analysis.engine as { trend: string }).trend
      : null;
  if (engTrend) htfStrip.push(`엔진 추세: ${engTrend}`);
  if (ddWeightOn && dd) {
    htfStrip.push(`Δ ${dd.regime === 'buy' ? '매수' : dd.regime === 'sell' ? '매도' : '중립'} · ${dd.smoothedPct.toFixed(1)}% · ${dd.persistenceBars}봉`);
  }

  const watchRules: Array<{ id: string; label: string; matched: boolean }> = [
    {
      id: 'w1',
      label: '채널·합류 + (지지/저항) OB 근접',
      matched: Boolean(smcLs && (analysis.nearestSupportOb || analysis.nearestResistanceOb)),
    },
    {
      id: 'w2',
      label: '구조 + RSI (확정 게이트)',
      matched: Boolean(cs?.structure && cs?.rsi),
    },
    {
      id: 'w3',
      label: 'RSI 다이버전스 표시',
      matched: Boolean(rsiDiv?.divergence?.bullish || rsiDiv?.divergence?.bearish),
    },
    {
      id: 'w4',
      label: '채널 하단+수요 재진입+구조 스윕 + Δ전환(음→양)',
      matched:
        Boolean(smcLs?.side === 'LONG') &&
        Boolean(analysis.nearestSupportOb) &&
        Boolean(analysis.structureRocketSignals?.some((s) => s.source?.includes('retest') || s.source?.includes('zone_'))) &&
        ddFilterOn &&
        dd?.flip === 'up',
    },
  ];

  return {
    confluenceScore,
    confluenceMax: 100,
    tags: [...new Set(tags)],
    longScenario,
    shortScenario,
    tradePlan: { direction: dir, entry, stopLoss, targets, layerNotes },
    htfStrip,
    watchRules,
    depthDelta: dd
      ? {
          regime: dd.regime,
          flip: dd.flip,
          strength: dd.strength,
          smoothedPct: dd.smoothedPct,
          persistenceBars: dd.persistenceBars,
          trapLong: dd.trapLong,
          trapShort: dd.trapShort,
          seriesPct: dd.seriesPct ?? [],
        }
      : null,
    replayNote,
  };
}
