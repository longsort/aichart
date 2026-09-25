/**
 * 통합·분석 데스크에 Eagle1 CORE / A+ / Entry·SL·TP 작도·가격선을 주입.
 * pipeline → analyze → 이 헬퍼 → MergedAnalysisDeskView → ChartViewMergedServer.
 *
 * 가시성 수정:
 * - practical 없어도 support/resistance 단독 주입
 * - eagle1CoreZoneFusion 없으면 eagle1Zones / eagle1ChartUx 폴백
 * - WAIT여도 CORE 중앙선·가격선 유지
 */

import type { OverlayItem, AnalyzeResponse, Candle } from '@/types';
import {
  coreZoneFusionToOverlays,
  aPlusZoneToOverlay,
  coreZoneToOverlay,
} from './zoneOverlays';
import { attachFunctionalOverlayLabel } from './chartUx';
import { buildExecutionPracticalPriceLines } from './executionLevels';
import type { CoreZone, CoreZoneFusionReport } from './coreZoneFusionEngine';
import type { StrategyZoneFusionReport } from './strategyZoneFusionEngine';
import type { ExecutionLevelsReport } from './executionLevels';
import type { ContinuationReport } from './continuationEngine';
import type { ZoneCluster } from './zoneEngine';
import type { ZoneDensityProfile } from './zoneDensityProfile';

export type MergedDeskEagle1Inject = {
  overlays: OverlayItem[];
  priceLines: Array<{
    price: number;
    title: string;
    color: string;
    lineWidth: 1 | 2 | 3 | 4;
    lineStyle: 'solid' | 'dashed' | 'dotted';
    axisLabel?: boolean;
  }>;
  note: string;
};

const EMPTY_DENSITY: ZoneDensityProfile = {
  binWidth: 1,
  bins: [],
  peakScore: 0,
  peakBand: null,
  evidenceCount: 0,
  note: 'fallback',
};

function lastCandleTime(candles: Candle[] | null | undefined): number {
  if (!candles?.length) return Math.floor(Date.now() / 1000);
  const t = Number(candles[candles.length - 1]?.time);
  return Number.isFinite(t) && t > 0 ? t : Math.floor(Date.now() / 1000);
}

/** CORE 가로폭: 첫 봉 또는 최근 14일 → 마지막 봉 */
export function resolveEagle1CoreTimeSpan(candles: Candle[] | null | undefined): {
  time1: number;
  time2: number;
} {
  const time2 = lastCandleTime(candles);
  const first = candles?.length ? Number(candles[0]?.time) : NaN;
  const fourteen = Math.max(0, time2 - 86400 * 14);
  let time1 = Number.isFinite(first) && first > 0 ? Math.min(first, fourteen) : fourteen;
  if (!(time1 < time2)) time1 = Math.max(0, time2 - 86400 * 3);
  return { time1, time2 };
}

function pushPriceLine(
  list: MergedDeskEagle1Inject['priceLines'],
  pl: MergedDeskEagle1Inject['priceLines'][number]
) {
  if (!(pl.price > 0) || !Number.isFinite(pl.price)) return;
  if (list.some((x) => Math.abs(x.price - pl.price) < 1e-9 && x.title === pl.title)) return;
  list.push(pl);
}

/** keyLevel 전폭선 — 존 박스 실패해도 ChartView가 그림 */
function coreMidKeyLevel(
  id: string,
  price: number,
  title: string,
  color: string,
  time1: number,
  time2: number
): OverlayItem {
  return attachFunctionalOverlayLabel({
    id,
    kind: 'keyLevel',
    label: title,
    x1: 0,
    y1: 0,
    x2: 1,
    y2: 1,
    time1,
    time2,
    price1: price,
    price2: price,
    priceFrozen1: price,
    priceFrozen2: price,
    confidence: 88,
    color,
    category: 'zones',
    noProject: true,
    overlayZoneExtraClass: 'eagle1-zone eagle1-zone--core eagle1-zone--core-midline',
    zoneFaceBase: title,
    labelTooltip: `${title} · CORE 중앙선 · 확률 단정 아님`,
  });
}

function clusterToPseudoCore(
  c: ZoneCluster,
  side: 'SUPPORT' | 'RESISTANCE',
  tf: string,
  now: number
): CoreZone {
  const lower = Math.min(c.lower, c.upper);
  const upper = Math.max(c.lower, c.upper);
  return {
    id: `core-fallback-${side.toLowerCase()}-${c.cluster_id}`,
    side,
    labelEn: side === 'SUPPORT' ? 'CORE SUPPORT' : 'CORE RESISTANCE',
    labelKo: side === 'SUPPORT' ? `CORE SUPPORT ${tf}` : `CORE RESISTANCE ${tf}`,
    sourceTimeframe: tf,
    lower,
    upper,
    midpoint: (lower + upper) / 2,
    score: c.tier === 'S' ? 85 : c.tier === 'A' ? 75 : 65,
    evidenceIds: c.components.map((z) => z.zone_id),
    evidenceSources: c.sources.map(String),
    evidenceCount: c.components.length || 1,
    density: {
      ...EMPTY_DENSITY,
      peakBand: { lower, upper, score: 1, sources: c.sources.map(String) },
      evidenceCount: c.components.length || 1,
    },
    state: 'FRESH',
    frozen: false,
    createdAt: now,
    confirmedAt: null,
  };
}

function fallbackCoreFromZones(
  a: AnalyzeResponse,
  time1: number,
  time2: number
): { overlays: OverlayItem[]; priceLines: MergedDeskEagle1Inject['priceLines'] } {
  const overlays: OverlayItem[] = [];
  const priceLines: MergedDeskEagle1Inject['priceLines'] = [];
  const z = a.eagle1Zones;
  if (!z) return { overlays, priceLines };
  const tf = String(a.timeframe || '15m');
  const supports = [...(z.displaySupport ?? [])].slice(0, 1);
  const resists = [...(z.displayResist ?? [])].slice(0, 1);
  const rec = z.recommended;
  if (!supports.length && !resists.length && rec) {
    if (rec.bias === 'bearish') resists.push(rec);
    else supports.push(rec);
  }
  for (const s of supports) {
    const core = clusterToPseudoCore(s, 'SUPPORT', tf, time2);
    overlays.push(coreZoneToOverlay(core, time2, time1));
    overlays.push(
      coreMidKeyLevel(
        'eagle1-core-support-mid',
        core.midpoint,
        `CORE 지지 ${tf}`,
        '#22d3ee',
        time1,
        time2
      )
    );
    pushPriceLine(priceLines, {
      price: core.midpoint,
      title: `CORE 지지 ${tf}`,
      color: '#22d3ee',
      lineWidth: 3,
      lineStyle: 'solid',
      axisLabel: true,
    });
  }
  for (const r of resists) {
    const core = clusterToPseudoCore(r, 'RESISTANCE', tf, time2);
    overlays.push(coreZoneToOverlay(core, time2, time1));
    overlays.push(
      coreMidKeyLevel(
        'eagle1-core-resist-mid',
        core.midpoint,
        `CORE 저항 ${tf}`,
        '#f87171',
        time1,
        time2
      )
    );
    pushPriceLine(priceLines, {
      price: core.midpoint,
      title: `CORE 저항 ${tf}`,
      color: '#f87171',
      lineWidth: 3,
      lineStyle: 'solid',
      axisLabel: true,
    });
  }
  return { overlays, priceLines };
}

function fallbackFromChartUx(a: AnalyzeResponse): MergedDeskEagle1Inject['priceLines'] {
  const ux = a.eagle1ChartUx;
  if (!ux?.priceLines?.length) return [];
  const out: MergedDeskEagle1Inject['priceLines'] = [];
  for (const pl of ux.priceLines) {
    const title = String(pl.title || '');
    if (!/CORE|진입|손절|^TP\d|MAIN ENTRY|STOP|POC|매수|매도/i.test(title)) continue;
    pushPriceLine(out, {
      price: pl.price,
      title,
      color: pl.color,
      lineWidth: pl.lineWidth,
      lineStyle: pl.lineStyle,
      axisLabel: pl.axisLabel === true,
    });
  }
  return out;
}

function execEntryOverlay(
  exec: ExecutionLevelsReport,
  lastTime: number,
  time1: number
): OverlayItem | null {
  const z = exec.entry?.zone;
  if (!z || !(lastTime > 0)) return null;
  const low = Math.min(z.low, z.high);
  const high = Math.max(z.low, z.high);
  if (!(high - low > 0) || !Number.isFinite(high - low)) return null;
  const t1 = time1 < lastTime ? time1 : Math.max(0, lastTime - 86400 * 3);
  return attachFunctionalOverlayLabel({
    id: 'eagle1-exec-entry',
    kind: 'demandZone',
    label: '메인 진입',
    x1: 0,
    y1: 0,
    x2: 1,
    y2: 1,
    time1: t1,
    time2: lastTime,
    price1: high,
    price2: low,
    priceFrozen1: high,
    priceFrozen2: low,
    confidence: exec.entry.allowEntry ? 84 : 60,
    color: exec.entry.allowEntry ? 'rgba(34,197,94,0.18)' : 'rgba(148,163,184,0.14)',
    category: 'zones',
    noProject: true,
    overlayZoneExtraClass: 'eagle1-zone eagle1-zone--exec merged-desk-zone-caption-clean',
    zoneFaceBase: '메인 진입',
    labelTooltip: `${z.labelEn} · ${z.note}`,
  });
}

export function buildMergedDeskEagle1CoreInject(params: {
  analysis: AnalyzeResponse | null | undefined;
  candles: Candle[] | null | undefined;
}): MergedDeskEagle1Inject {
  const empty: MergedDeskEagle1Inject = { overlays: [], priceLines: [], note: 'UNAVAILABLE' };
  const a = params.analysis;
  if (!a) return empty;

  const core = (a as { eagle1CoreZoneFusion?: CoreZoneFusionReport | null }).eagle1CoreZoneFusion;
  const fusion = (a as { eagle1StrategyFusion?: StrategyZoneFusionReport | null })
    .eagle1StrategyFusion;
  const exec = (a as { eagle1ExecutionLevels?: ExecutionLevelsReport | null }).eagle1ExecutionLevels;
  const cont = (a as { eagle1Continuation?: ContinuationReport | null }).eagle1Continuation;
  const { time1, time2: lastTime } = resolveEagle1CoreTimeSpan(params.candles);
  const overlays: OverlayItem[] = [];
  const priceLines: MergedDeskEagle1Inject['priceLines'] = [];

  const hasCorePieces = !!(
    core?.support ||
    core?.resistance ||
    (core?.practical?.length ?? 0) > 0
  );
  if (hasCorePieces && core) {
    overlays.push(...coreZoneFusionToOverlays(core, lastTime, time1));
    if (core.support) {
      pushPriceLine(priceLines, {
        price: core.support.midpoint,
        title: `CORE 지지 ${core.support.sourceTimeframe}`,
        color: '#22d3ee',
        lineWidth: 3,
        lineStyle: 'solid',
        axisLabel: true,
      });
      overlays.push(
        coreMidKeyLevel(
          'eagle1-core-support-mid',
          core.support.midpoint,
          `CORE 지지 ${core.support.sourceTimeframe}`,
          '#22d3ee',
          time1,
          lastTime
        )
      );
    }
    if (core.resistance) {
      pushPriceLine(priceLines, {
        price: core.resistance.midpoint,
        title: `CORE 저항 ${core.resistance.sourceTimeframe}`,
        color: '#f87171',
        lineWidth: 3,
        lineStyle: 'solid',
        axisLabel: true,
      });
      overlays.push(
        coreMidKeyLevel(
          'eagle1-core-resist-mid',
          core.resistance.midpoint,
          `CORE 저항 ${core.resistance.sourceTimeframe}`,
          '#f87171',
          time1,
          lastTime
        )
      );
    }
  }

  if (!overlays.some((o) => String(o.id).startsWith('eagle1-core'))) {
    const fb = fallbackCoreFromZones(a, time1, lastTime);
    overlays.push(...fb.overlays);
    for (const pl of fb.priceLines) pushPriceLine(priceLines, pl);
  }
  if (!priceLines.length) {
    for (const pl of fallbackFromChartUx(a)) pushPriceLine(priceLines, pl);
  }

  for (const ap of fusion?.practical ?? []) {
    overlays.push(
      aPlusZoneToOverlay(
        {
          id: ap.id,
          side: ap.side,
          labelEn: ap.labelEn,
          labelKo: ap.labelKo,
          lower: ap.lower,
          upper: ap.upper,
          setupScore: ap.setupScore,
          strategyTypes: ap.strategyTypes,
        },
        lastTime,
        time1
      )
    );
    pushPriceLine(priceLines, {
      price: ap.midpoint,
      title: ap.labelEn,
      color: ap.side === 'LONG' ? '#34d399' : '#fb7185',
      lineWidth: 3,
      lineStyle: 'solid',
      axisLabel: true,
    });
  }

  if (exec) {
    const lines =
      exec.practicalPriceLines?.length > 0
        ? exec.practicalPriceLines
        : buildExecutionPracticalPriceLines(exec.entry, exec.stop, exec.target);
    for (const pl of lines) {
      pushPriceLine(priceLines, {
        price: pl.price,
        title: pl.title,
        color: pl.color,
        lineWidth: pl.lineWidth,
        lineStyle: pl.lineStyle,
        axisLabel: true,
      });
    }
    const entryOv = execEntryOverlay(exec, lastTime, time1);
    if (entryOv) overlays.push(entryOv);
  }

  const zCount = overlays.filter(
    (o) =>
      String(o.id).startsWith('eagle1-core') ||
      String(o.id).startsWith('eagle1-aplus') ||
      o.id === 'eagle1-exec-entry'
  ).length;
  const lineCount = priceLines.length;
  const parts: string[] = [];
  if (overlays.some((o) => String(o.id).startsWith('eagle1-core'))) parts.push('CORE');
  if (overlays.some((o) => String(o.id).startsWith('eagle1-aplus'))) parts.push('A+');
  if (
    overlays.some((o) => o.id === 'eagle1-exec-entry') ||
    (exec?.practicalPriceLines?.length ?? 0) > 0
  ) {
    parts.push('E/SL/TP');
  }
  if (cont && cont.action !== 'NONE') parts.push(`Cont ${cont.labelKo}`);

  return {
    overlays,
    priceLines,
    note:
      overlays.length === 0 && priceLines.length === 0
        ? 'CORE/A+/진입 없음 — analyze eagle1 확인'
        : `inject ${zCount}z/${lineCount}선${parts.length ? ` · ${parts.join('+')}` : ''}${
            cont?.summaryKo && cont.action !== 'NONE' ? ` · ${cont.summaryKo}` : ''
          }`,
  };
}

/** 툴바 칩 — 데이터 도착 여부 UI 증명 */
export function formatEagle1InjectChip(
  inj: MergedDeskEagle1Inject,
  loading?: boolean
): { on: boolean; label: string } {
  const z = inj.overlays.filter(
    (o) =>
      String(o.id).startsWith('eagle1-core') ||
      String(o.id).startsWith('eagle1-aplus') ||
      o.id === 'eagle1-exec-entry'
  ).length;
  const lines = inj.priceLines.length;
  if (z === 0 && lines === 0) {
    return { on: false, label: loading ? 'E1대기' : 'E1없음' };
  }
  return { on: true, label: `E1:${z}z/${lines}선` };
}

/** 간단 selftest */
export function mergedDeskCoreInjectSelftest(): { ok: boolean; notes: string[] } {
  const notes: string[] = [];
  const span = resolveEagle1CoreTimeSpan([
    { time: 1_700_000_000, open: 1, high: 2, low: 0.5, close: 1.5, volume: 1 },
    {
      time: 1_700_000_000 + 86400 * 20,
      open: 1,
      high: 2,
      low: 0.5,
      close: 1.5,
      volume: 1,
    },
  ] as Candle[]);
  if (!(span.time1 < span.time2)) notes.push('time span');

  const supportOnly: CoreZoneFusionReport = {
    support: {
      id: 'c-s',
      side: 'SUPPORT',
      labelEn: 'CORE SUPPORT',
      labelKo: 'CORE SUPPORT 15m',
      sourceTimeframe: '15m',
      lower: 100,
      upper: 102,
      midpoint: 101,
      score: 80,
      evidenceIds: [],
      evidenceSources: ['poc'],
      evidenceCount: 1,
      density: {
        ...EMPTY_DENSITY,
        peakBand: { lower: 100, upper: 102, score: 1, sources: ['poc'] },
        evidenceCount: 1,
      },
      state: 'FRESH',
      frozen: false,
      createdAt: span.time2,
      confirmedAt: null,
    },
    resistance: null,
    practical: [],
    rawEvidenceCount: 1,
    densitySupport: {
      ...EMPTY_DENSITY,
      peakBand: { lower: 100, upper: 102, score: 1, sources: ['poc'] },
      evidenceCount: 1,
    },
    densityResist: EMPTY_DENSITY,
    note: 'support-only',
  };

  const inj = buildMergedDeskEagle1CoreInject({
    analysis: {
      symbol: 'BTCUSDT',
      timeframe: '15m',
      verdict: 'WAIT',
      confidence: 0,
      eagle1CoreZoneFusion: supportOnly,
    } as AnalyzeResponse,
    candles: [
      { time: span.time1, open: 1, high: 2, low: 0.5, close: 1.5, volume: 1 },
      { time: span.time2, open: 1, high: 2, low: 0.5, close: 1.5, volume: 1 },
    ] as Candle[],
  });
  if (!inj.overlays.some((o) => String(o.id).startsWith('eagle1-core'))) {
    notes.push('support-only should inject CORE overlay');
  }
  if (!inj.priceLines.some((p) => /CORE/.test(p.title))) {
    notes.push('support-only should inject CORE price line');
  }
  const chip = formatEagle1InjectChip(inj);
  if (!chip.on || !/^E1:\d+z\/\d+선$/.test(chip.label)) notes.push(`chip ${chip.label}`);

  const emptyChip = formatEagle1InjectChip({ overlays: [], priceLines: [], note: 'x' });
  if (emptyChip.label !== 'E1없음') notes.push('empty chip');

  return { ok: notes.length === 0, notes };
}
