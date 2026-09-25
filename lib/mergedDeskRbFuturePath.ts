/**
 * 파랑빨강띠 — 미래 움직임 시나리오(조건부 전망).
 * 채널 구간이 쌓일수록 필요한 「앞으로 어디까지」 투영.
 * 가격선·고저존·점선경로로 우측(미래축)에 표시. 확정 경로·승률 아님.
 */
import type { Candle, OverlayItem } from '@/types';
import type { AtlasPulsePriceLine } from '@/lib/monthDeskAtlasPulseDesk';
import type { MergedDeskChannelGeom } from '@/lib/mergedDeskBlueRedChannels';
import type { MergedDeskRbWaveHorizonForecast } from '@/lib/mergedDeskRbWaveHorizonForecast';
import type { MergedDeskRbEdgeConfluenceGatePack } from '@/lib/mergedDeskRbEdgeConfluenceGate';
import { MERGED_DESK_RIGHT_FUTURE_BARS } from '@/lib/mergedDeskSharedChartView';

export type RbFuturePathSide = 'LONG' | 'SHORT' | 'WAIT';

export type MergedDeskRbFuturePathPack = {
  side: RbFuturePathSide;
  /** 주 시나리오 (조건부) */
  mainKo: string;
  /** 대안 시나리오 */
  altKo: string;
  /** 무효화 */
  invalidKo: string;
  expectBars: number;
  tLive: number;
  tFuture: number;
  targetHi: number | null;
  targetLo: number | null;
  midPath: number | null;
  placeRefOk: boolean;
  summaryKo: string;
  shortKo: string;
  overlays: OverlayItem[];
  priceLines: AtlasPulsePriceLine[];
};

function barStepSec(candles: Candle[]): number {
  const n = candles.length;
  if (n < 2) return 3600;
  const a = Number(candles[n - 1]!.time);
  const b = Number(candles[n - 2]!.time);
  const d = Math.abs(a - b);
  return d > 0 && Number.isFinite(d) ? d : 3600;
}

function clampPx(p: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, p));
}

/**
 * 모든 합류·전망 재료로 미래 움직임(주/부 시나리오) 투영.
 */
export function buildMergedDeskRbFuturePathPack(params: {
  candles: Candle[];
  forecast: MergedDeskRbWaveHorizonForecast | null;
  edgeGate?: MergedDeskRbEdgeConfluenceGatePack | null;
  geom?: MergedDeskChannelGeom | null;
  masterSide?: RbFuturePathSide | null;
}): MergedDeskRbFuturePathPack {
  const candles = params.candles ?? [];
  const iLive = Math.max(0, candles.length - 1);
  const tLive = Number(candles[iLive]?.time) || 0;
  const close = Number(candles[iLive]?.close) || 0;
  const empty = (): MergedDeskRbFuturePathPack => ({
    side: 'WAIT',
    mainKo: '미래움직임 — 봉 부족',
    altKo: '',
    invalidKo: '',
    expectBars: 0,
    tLive,
    tFuture: tLive,
    targetHi: null,
    targetLo: null,
    midPath: null,
    placeRefOk: false,
    summaryKo: '미래움직임 대기',
    shortKo: '미래대기',
    overlays: [],
    priceLines: [],
  });
  if (candles.length < 24 || !(close > 0) || !(tLive > 0)) return empty();

  const f = params.forecast;
  const gate = params.edgeGate;
  const g = params.geom;
  const step = barStepSec(candles);
  const expectBars = Math.max(
    6,
    Math.min(
      MERGED_DESK_RIGHT_FUTURE_BARS,
      Math.round(f?.expectBars || MERGED_DESK_RIGHT_FUTURE_BARS * 0.6)
    )
  );
  const tFuture = tLive + step * expectBars;

  const railHi = g != null ? Number(g.tipUpper) : close * 1.02;
  const railLo = g != null ? Number(g.tipLower) : close * 0.98;
  let targetHi = f?.targetHi ?? null;
  let targetLo = f?.targetLo ?? null;
  if (targetHi == null && Number.isFinite(railHi)) targetHi = railHi;
  if (targetLo == null && Number.isFinite(railLo)) targetLo = railLo;
  /** 레일 밖으로 과도한 전망은 레일±ATR급으로만 허용(차트 폭주 방지) */
  const span = Math.max(Math.abs(railHi - railLo), close * 0.004);
  if (targetHi != null) targetHi = clampPx(targetHi, railLo - span * 0.15, railHi + span * 1.35);
  if (targetLo != null) targetLo = clampPx(targetLo, railLo - span * 1.35, railHi + span * 0.15);

  const descending = Boolean(g?.descending ?? f?.elliott?.bias === 'bearish');
  const gateSide = gate?.side ?? 'WAIT';
  const master = params.masterSide ?? 'WAIT';
  let side: RbFuturePathSide = 'WAIT';
  if (gateSide === 'LONG' || gateSide === 'SHORT') side = gateSide;
  else if (master === 'LONG' || master === 'SHORT') side = master;
  else side = descending ? 'SHORT' : 'LONG';

  const placeRefOk = Boolean(gate?.placeRefOk);
  const midPath =
    targetHi != null && targetLo != null
      ? (targetHi + targetLo) / 2
      : close;

  const srcBits = [
    ...(f?.sourcesKo ?? []).slice(0, 3),
    gate?.shortKo || '',
    placeRefOk ? '자리참고' : '합류대기',
  ].filter(Boolean);

  const mainKo =
    side === 'SHORT'
      ? `주:하락지속 → 저점존 ${targetLo != null ? targetLo.toFixed(0) : '—'} · ≈${expectBars}봉`
      : side === 'LONG'
        ? `주:상승지속 → 고점존 ${targetHi != null ? targetHi.toFixed(0) : '—'} · ≈${expectBars}봉`
        : `주:횡보·대기 · 복도 ${railLo.toFixed(0)}~${railHi.toFixed(0)}`;

  const altKo =
    side === 'SHORT'
      ? `부:반등 → 피보GP·AVWAP·상단저항 ${targetHi != null ? targetHi.toFixed(0) : railHi.toFixed(0)}`
      : side === 'LONG'
        ? `부:되돌림 → 하단지지·수요 ${targetLo != null ? targetLo.toFixed(0) : railLo.toFixed(0)}`
        : `부:방향확정 대기 · 돌파/이탈 후 재판정`;

  const invalidKo =
    side === 'SHORT'
      ? `무효: 종가 상단레일 ${railHi.toFixed(0)} 상회·유지`
      : side === 'LONG'
        ? `무효: 종가 하단레일 ${railLo.toFixed(0)} 하회·유지`
        : `무효: 복도 붕괴(상·하 레일 이탈)`;

  const shortKo = `미래움직임·${expectBars}봉`;
  const summaryKo = [
    shortKo,
    mainKo,
    altKo,
    invalidKo,
    srcBits.slice(0, 4).join('·'),
    '조건부전망·승률아님',
  ]
    .filter(Boolean)
    .join(' · ');

  const priceLines: AtlasPulsePriceLine[] = [];
  if (targetHi != null) {
    priceLines.push({
      price: targetHi,
      title: '변동상단전망',
      color: 'rgba(232,121,249,0.92)',
      lineWidth: 1,
      lineStyle: 'dotted',
      axisLabel: true,
    });
  }
  if (targetLo != null) {
    priceLines.push({
      price: targetLo,
      title: '변동하단전망',
      color: 'rgba(74,222,128,0.92)',
      lineWidth: 1,
      lineStyle: 'dotted',
      axisLabel: true,
    });
  }
  if (midPath != null && Number.isFinite(midPath)) {
    priceLines.push({
      price: midPath,
      title: '미래중선',
      color: 'rgba(250,204,21,0.75)',
      lineWidth: 1,
      lineStyle: 'dashed',
      axisLabel: false,
    });
  }

  const overlays: OverlayItem[] = [];
  const pad = Math.max(span * 0.04, close * 0.0008);

  /** 우측 미래축 고·저존 (캔들 위가 아니라 last→future) */
  if (targetHi != null) {
    overlays.push({
      id: 'merged-desk-rb-future-hi-zone',
      kind: 'supplyZone',
      label: `고점존 저항 · 피보·엘리엇`,
      zoneFaceBase: '고점존',
      zoneFaceSignal: '미래전망',
      x1: 0.85,
      y1: 0.12,
      x2: 0.99,
      y2: 0.12,
      time1: tLive,
      time2: tFuture,
      price1: targetHi + pad,
      price2: targetHi - pad * 0.35,
      confidence: 84,
      color: 'rgba(248,113,113,0.22)',
      category: 'chartPrimeTrendChannels',
      overlayZoneExtraClass:
        'merged-desk-rb-future-zone merged-desk-rb-future-hi merged-desk-zone-label-on',
      labelTooltip: `${mainKo}\n${altKo}\n${invalidKo}\n참고·승률아님`,
      lineLabelColor: '#fecaca',
      labelBackgroundColor: 'rgba(127,29,29,0.9)',
      labelTextColor: '#fff1f2',
    });
  }
  if (targetLo != null) {
    overlays.push({
      id: 'merged-desk-rb-future-lo-zone',
      kind: 'demandZone',
      label: `저점존 지지 · 채널하단·수요`,
      zoneFaceBase: '저점존',
      zoneFaceSignal: '미래전망',
      x1: 0.85,
      y1: 0.88,
      x2: 0.99,
      y2: 0.88,
      time1: tLive,
      time2: tFuture,
      price1: targetLo + pad * 0.35,
      price2: targetLo - pad,
      confidence: 84,
      color: 'rgba(74,222,128,0.22)',
      category: 'chartPrimeTrendChannels',
      overlayZoneExtraClass:
        'merged-desk-rb-future-zone merged-desk-rb-future-lo merged-desk-zone-label-on',
      labelTooltip: `${mainKo}\n${altKo}\n${invalidKo}\n참고·승률아님`,
      lineLabelColor: '#bbf7d0',
      labelBackgroundColor: 'rgba(20,83,45,0.9)',
      labelTextColor: '#f0fdf4',
    });
  }

  /** 주 경로 점선: 종가 → 주목표가 */
  const pathPx = side === 'SHORT' ? targetLo : side === 'LONG' ? targetHi : midPath;
  if (pathPx != null && Number.isFinite(pathPx)) {
    overlays.push({
      id: 'merged-desk-rb-future-main-path',
      kind: 'trendLine',
      label: side === 'WAIT' ? '횡보경로' : '주경로',
      zoneFaceBase: '미래경로',
      zoneFaceSignal: shortKo,
      x1: 0.7,
      y1: 0.5,
      x2: 0.95,
      y2: 0.5,
      time1: tLive,
      time2: tFuture,
      price1: close,
      price2: pathPx,
      confidence: 78,
      color: side === 'SHORT' ? 'rgba(248,113,113,0.85)' : side === 'LONG' ? 'rgba(74,222,128,0.85)' : 'rgba(250,204,21,0.8)',
      lineWidth: 2,
      lineDash: '6 4',
      category: 'chartPrimeTrendChannels',
      overlayZoneExtraClass: 'merged-desk-rb-future-path',
      labelTooltip: `${mainKo}\n점선=조건부 주경로 · 확정 아님`,
      lineLabelColor: '#f8fafc',
      labelBackgroundColor: 'rgba(15,23,42,0.9)',
      labelTextColor: '#f8fafc',
      noProject: true,
    });
  }

  /** 부 경로 */
  const altPx = side === 'SHORT' ? targetHi : side === 'LONG' ? targetLo : null;
  if (altPx != null && Number.isFinite(altPx)) {
    overlays.push({
      id: 'merged-desk-rb-future-alt-path',
      kind: 'trendLine',
      label: '부경로',
      zoneFaceBase: '미래경로',
      zoneFaceSignal: '대안',
      x1: 0.7,
      y1: 0.45,
      x2: 0.95,
      y2: 0.45,
      time1: tLive,
      time2: tFuture,
      price1: close,
      price2: altPx,
      confidence: 70,
      color: 'rgba(148,163,184,0.75)',
      lineWidth: 1,
      lineDash: '2 4',
      category: 'chartPrimeTrendChannels',
      overlayZoneExtraClass: 'merged-desk-rb-future-alt-path',
      labelTooltip: `${altKo}\n대안 시나리오 · 확정 아님`,
      noProject: true,
    });
  }

  overlays.push({
    id: 'merged-desk-rb-future-badge',
    kind: 'label',
    label: `파랑빨강띠 · 미래움직임 · ${placeRefOk ? `자리참고${gate?.coreHitCount ?? 0}/6` : '합류대기'}`,
    x1: 0.02,
    y1: 0.04,
    x2: 0.45,
    y2: 0.04,
    time1: tLive,
    time2: tLive,
    price1: close,
    price2: close,
    confidence: 80,
    color: '#e2e8f0',
    category: 'chartPrimeTrendChannels',
    overlayZoneExtraClass: 'merged-desk-rb-future-badge',
    labelTooltip: summaryKo,
    labelBackgroundColor: 'rgba(2,6,23,0.92)',
    labelTextColor: '#f8fafc',
    noProject: true,
  });

  return {
    side,
    mainKo,
    altKo,
    invalidKo,
    expectBars,
    tLive,
    tFuture,
    targetHi,
    targetLo,
    midPath,
    placeRefOk,
    summaryKo,
    shortKo,
    overlays,
    priceLines,
  };
}
