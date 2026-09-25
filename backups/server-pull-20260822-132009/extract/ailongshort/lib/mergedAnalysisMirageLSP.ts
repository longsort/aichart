/**
 * Mirage Liquidity Sweep Pro — 통합·분석 데스크 차트 오버레이 (한글 라벨).
 */
import type { Candle, OverlayItem } from '@/types';
import type { UTCTimestamp } from 'lightweight-charts';
import type { AtlasPulseMarker } from '@/lib/monthDeskAtlasPulseDesk';
import { normalizeChartTimeframe } from '@/lib/constants';
import { mergedWorkCandles } from '@/lib/mergedAnalysisOverlayTimes';
import {
  runMirageLiquiditySweep,
  fmtPctFromEntry,
  fmtMirageCryptoPrice,
  type MirageDashboard,
  type MirageLspResult,
} from '@/lib/mirageLiquiditySweepIndicator';

const BULL = '#00E676';
const BEAR = '#FF5252';
const SL_COLOR = '#E57373';
const TP1_COLOR = '#66BB6A';
const TP2_COLOR = '#4DB6AC';
const TP3_COLOR = '#42A5F5';
const TP_HIT = '#4DB6AC';
const ENTRY_COLOR = '#FF9800';
const BE_COLOR = '#FFA726';
const LIQ_COLOR = 'rgba(144,164,174,0.55)';
const EQ_COLOR = '#B0BEC5';
const TARGET_COLOR = '#FFCA28';
const LEVEL_COLOR = 'rgba(176,190,197,0.55)';

const fmtPx = fmtMirageCryptoPrice;

/** TOP/BOT와 동일 — time1·price1로 줌·패닝 시 캔들에 고정 */
function mlspCandleLabel(
  item: Pick<
    OverlayItem,
    | 'id'
    | 'label'
    | 'time1'
    | 'price1'
    | 'color'
    | 'labelBackgroundColor'
    | 'labelTextColor'
    | 'lineLabelColor'
    | 'overlayZoneExtraClass'
  > & { confidence?: number }
): OverlayItem {
  const t = Number(item.time1);
  const p = Number(item.price1);
  return {
    ...item,
    kind: 'label',
    confidence: item.confidence ?? 0.85,
    x1: 0,
    y1: 0,
    time1: t as UTCTimestamp,
    price1: p,
    category: 'mirageLSP',
  };
}

function mlspHorizLine(params: {
  id: string;
  label: string;
  t1: number;
  t2: number;
  price: number;
  color: string;
  extraClass: string;
  dash?: string;
  width?: number;
  confidence?: number;
}): OverlayItem {
  return {
    id: params.id,
    kind: 'trendLine',
    label: params.label,
    x1: 0,
    y1: 0,
    x2: 1,
    y2: 1,
    time1: params.t1 as UTCTimestamp,
    time2: params.t2 as UTCTimestamp,
    price1: params.price,
    price2: params.price,
    confidence: params.confidence ?? 0.8,
    color: params.color,
    lineDash: params.dash,
    lineStrokeWidth: params.width ?? 1,
    category: 'mirageLSP',
    overlayZoneExtraClass: params.extraClass,
    noProject: true,
  };
}

export type MergedMirageLspChartPack = {
  markers: AtlasPulseMarker[];
  overlays: OverlayItem[];
  result: MirageLspResult;
  dashboard: MirageDashboard;
  summaryKo: string;
};

export function summarizeMergedMirageLspKo(result: MirageLspResult): string {
  return result.summaryKo;
}

export function buildMergedMirageLspChartPack(params: {
  candles: Candle[];
  timeframe: string;
}): MergedMirageLspChartPack {
  const tf = normalizeChartTimeframe(params.timeframe);
  const work = mergedWorkCandles(params.candles, tf);
  const result = runMirageLiquiditySweep(work, undefined, tf);
  const opts = result.options;
  const lastTime = work[work.length - 1]?.time ?? 0;
  const barDur = result.barDur;

  const overlays: OverlayItem[] = [];
  const markers: AtlasPulseMarker[] = [];

  for (const sv of result.sweepVis) {
    const sweepEnd = Math.min(
      sv.sweepTime + barDur * opts.sweepLineExtendBars,
      lastTime
    );
    if (opts.showSweepLine) {
      overlays.push(
        mlspHorizLine({
          id: `merged-ares-mlsp-sweep-lvl-${sv.sweepTime}-${sv.dir}`,
          label: '',
          t1: sv.originTime,
          t2: sweepEnd,
          price: sv.lvl,
          color: sv.dir === 1 ? `rgba(0,230,118,0.45)` : `rgba(255,82,82,0.45)`,
          extraClass: 'merged-ares-mlsp-sweep-line',
          dash: '6 4',
          confidence: Math.min(1, sv.score / 100),
        })
      );
      overlays.push(
        mlspCandleLabel({
          id: `merged-ares-mlsp-sweep-tag-${sv.sweepTime}-${sv.dir}`,
          label: sv.dir === 1 ? '스윕(상승)' : '스윕(하락)',
          time1: sv.sweepTime as UTCTimestamp,
          price1: sv.lvl,
          color: sv.dir === 1 ? BULL : BEAR,
          labelBackgroundColor: 'rgba(8,15,25,0.72)',
          labelTextColor: sv.dir === 1 ? BULL : BEAR,
          overlayZoneExtraClass: 'merged-ares-mlsp-sweep-tag-label',
          confidence: 0.82,
        })
      );
    }
    if (opts.showSweepPen) {
      overlays.push({
        id: `merged-ares-mlsp-sweep-pen-${sv.sweepTime}-${sv.dir}`,
        kind: 'trendLine',
        label: '',
        x1: 0,
        y1: 0,
        x2: 1,
        y2: 1,
        time1: sv.sweepTime as UTCTimestamp,
        price1: sv.lvl,
        time2: sv.sweepTime as UTCTimestamp,
        price2: sv.penetration,
        confidence: 0.9,
        color: sv.dir === 1 ? BULL : BEAR,
        lineStrokeWidth: 3,
        category: 'mirageLSP',
        overlayZoneExtraClass: 'merged-ares-mlsp-sweep-pen',
        noProject: true,
      });
      overlays.push(
        mlspCandleLabel({
          id: `merged-ares-mlsp-pen-label-${sv.sweepTime}-${sv.dir}`,
          label: '스윕 침투',
          time1: sv.sweepTime as UTCTimestamp,
          price1: sv.penetration,
          color: sv.dir === 1 ? BULL : BEAR,
          labelBackgroundColor: 'rgba(8,15,25,0.78)',
          labelTextColor: sv.dir === 1 ? BULL : BEAR,
          overlayZoneExtraClass: 'merged-ares-mlsp-pen-label',
          confidence: 0.9,
        })
      );
    }
  }

  for (const eq of result.eqMarks) {
    overlays.push(
      mlspHorizLine({
        id: `merged-ares-mlsp-eq-${eq.kind}-${eq.t2}`,
        label: '',
        t1: eq.t1,
        t2: eq.t2,
        price: eq.lvl,
        color: EQ_COLOR,
        extraClass: 'merged-ares-mlsp-eq-line',
        confidence: 0.75,
      })
    );
    overlays.push(
      mlspCandleLabel({
        id: `merged-ares-mlsp-eq-label-${eq.kind}-${eq.t2}`,
        label: eq.kind === 'eqh' ? 'EQH' : 'EQL',
        time1: eq.t2 as UTCTimestamp,
        price1: eq.lvl,
        color: EQ_COLOR,
        labelTextColor: '#ECEFF1',
        overlayZoneExtraClass: 'merged-ares-mlsp-eq-label',
        confidence: 0.7,
      })
    );
  }

  for (const liq of result.restingLiq) {
    overlays.push(
      mlspHorizLine({
        id: `merged-ares-mlsp-liq-${liq.side}-${liq.time}`,
        label: '',
        t1: liq.time,
        t2: lastTime,
        price: liq.lvl,
        color: LIQ_COLOR,
        extraClass: 'merged-ares-mlsp-liq-line',
        dash: '4 4',
        confidence: 0.65,
      })
    );
    overlays.push(
      mlspCandleLabel({
        id: `merged-ares-mlsp-liq-label-${liq.side}-${liq.time}`,
        label: liq.side === 'bsl' ? 'BSL' : 'SSL',
        time1: liq.time as UTCTimestamp,
        price1: liq.lvl,
        color: LIQ_COLOR,
        labelTextColor: '#B0BEC5',
        overlayZoneExtraClass: 'merged-ares-mlsp-liq-label',
        confidence: 0.65,
      })
    );
  }

  for (const sm of result.qualifiedSweepMarks.slice(-30)) {
    if (!opts.showSweeps) continue;
    markers.push({
      id: `merged-mlsp-sweep-x-${sm.time}-${sm.dir}`,
      time: sm.time as UTCTimestamp,
      position: sm.dir === 1 ? 'belowBar' : 'aboveBar',
      color: sm.dir === 1 ? BULL : BEAR,
      shape: 'circle',
      text: '×',
      size: 1,
    });
  }

  for (const sig of result.signalMarks.slice(-8)) {
    if (!opts.showSignals) continue;
    const isLong = sig.dir === 1;
    const bar = work[sig.bar];
    const pinPrice = isLong ? bar?.low : bar?.high;
    if (bar == null || pinPrice == null) continue;
    overlays.push(
      mlspCandleLabel({
        id: `merged-ares-mlsp-signal-${sig.time}-${sig.dir}`,
        label: sig.text,
        time1: sig.time as UTCTimestamp,
        price1: pinPrice,
        color: isLong ? BULL : BEAR,
        labelBackgroundColor: isLong ? BULL : BEAR,
        labelTextColor: isLong ? '#004D25' : '#FFFFFF',
        overlayZoneExtraClass: isLong
          ? 'merged-ares-mlsp-signal-long'
          : 'merged-ares-mlsp-signal-short',
        confidence: 0.95,
      })
    );
  }

  const trade = result.activeTrade ?? result.lastClosedTrade;
  const labelTime = trade ? trade.entryTime + barDur : 0;

  if (trade && opts.showLevel && trade.sweepLvl) {
    overlays.push(
      mlspHorizLine({
        id: `merged-ares-mlsp-swept-level-${trade.entryTime}`,
        label: '',
        t1: trade.entryTime - barDur,
        t2: lastTime,
        price: trade.sweepLvl,
        color: LEVEL_COLOR,
        extraClass: 'merged-ares-mlsp-level-line',
        dash: '2 3',
        confidence: 0.8,
      })
    );
  }

  if (trade && opts.showTarget && trade.targetLvl != null) {
    overlays.push(
      mlspHorizLine({
        id: `merged-ares-mlsp-target-${trade.entryTime}`,
        label: '',
        t1: trade.entryTime,
        t2: lastTime,
        price: trade.targetLvl,
        color: TARGET_COLOR,
        extraClass: 'merged-ares-mlsp-target-line',
        dash: '6 4',
        confidence: 0.85,
      })
    );
    overlays.push(
      mlspCandleLabel({
        id: `merged-ares-mlsp-target-label-${trade.entryTime}`,
        label: '◎ 유동성 목표',
        time1: labelTime as UTCTimestamp,
        price1: trade.targetLvl,
        color: TARGET_COLOR,
        labelTextColor: '#FFD54F',
        overlayZoneExtraClass: 'merged-ares-mlsp-target-label',
        confidence: 0.85,
      })
    );
  }

  if (trade && opts.showSlTp) {
    const showPct = opts.showPctOnLabels;
    const entry = trade.entry;
    const lines: Array<{
      key: string;
      price: number;
      color: string;
      dash?: string;
      width: number;
      labelPrefix: string;
      labelBg: string;
      labelText: string;
      hit?: boolean;
      extraClass: string;
    }> = [
      {
        key: 'entry',
        price: entry,
        color: trade.beActive ? BE_COLOR : ENTRY_COLOR,
        dash: '2 4',
        width: 1,
        labelPrefix: trade.beActive ? '진입 → 손절(본절)' : '진입',
        labelBg: trade.beActive ? BE_COLOR : ENTRY_COLOR,
        labelText: '#FFFFFF',
        extraClass: 'merged-ares-mlsp-entry-line',
      },
      {
        key: 'sl',
        price: trade.sl,
        color: trade.beActive ? `rgba(229,115,115,0.35)` : SL_COLOR,
        width: 2,
        labelPrefix: '손절',
        labelBg: trade.beActive ? `rgba(229,115,115,0.35)` : SL_COLOR,
        labelText: '#FFFFFF',
        extraClass: 'merged-ares-mlsp-sl-line',
      },
      {
        key: 'tp1',
        price: trade.tp1,
        color: trade.tp1Reached ? TP_HIT : TP1_COLOR,
        dash: trade.tp1Reached ? undefined : '6 4',
        width: trade.tp1Reached ? 2 : 1,
        labelPrefix: trade.tp1Reached ? '익절1 ✓' : '익절1',
        labelBg: trade.tp1Reached ? TP_HIT : TP1_COLOR,
        labelText: '#FFFFFF',
        hit: trade.tp1Reached,
        extraClass: 'merged-ares-mlsp-tp1-line',
      },
      {
        key: 'tp2',
        price: trade.tp2,
        color: trade.tp2Reached ? TP_HIT : TP2_COLOR,
        dash: trade.tp2Reached ? undefined : '6 4',
        width: trade.tp2Reached ? 2 : 1,
        labelPrefix: trade.tp2Reached ? '익절2 ✓' : '익절2',
        labelBg: trade.tp2Reached ? TP_HIT : TP2_COLOR,
        labelText: '#FFFFFF',
        hit: trade.tp2Reached,
        extraClass: 'merged-ares-mlsp-tp2-line',
      },
      {
        key: 'tp3',
        price: trade.tp3,
        color: trade.tp3Reached ? TP_HIT : TP3_COLOR,
        dash: trade.tp3Reached ? undefined : '6 4',
        width: trade.tp3Reached ? 2 : 1,
        labelPrefix: trade.tp3Reached ? '익절3 ✓' : '익절3',
        labelBg: trade.tp3Reached ? TP_HIT : TP3_COLOR,
        labelText: '#FFFFFF',
        hit: trade.tp3Reached,
        extraClass: 'merged-ares-mlsp-tp3-line',
      },
    ];

    for (const ln of lines) {
      overlays.push(
        mlspHorizLine({
          id: `merged-ares-mlsp-${ln.key}-line-${trade.entryTime}`,
          label: '',
          t1: trade.entryTime,
          t2: lastTime,
          price: ln.price,
          color: ln.color,
          extraClass: ln.extraClass,
          dash: ln.dash,
          width: ln.width,
          confidence: 0.92,
        })
      );

      if (opts.showSlTpLabels) {
        const pct = fmtPctFromEntry(ln.price, entry, showPct);
        overlays.push(
          mlspCandleLabel({
            id: `merged-ares-mlsp-${ln.key}-label-${trade.entryTime}`,
            label: `${ln.labelPrefix} ${fmtPx(ln.price)}${pct}`,
            time1: labelTime as UTCTimestamp,
            price1: ln.price,
            color: ln.color,
            labelBackgroundColor: ln.labelBg,
            labelTextColor: ln.labelText,
            lineLabelColor: ln.labelBg,
            overlayZoneExtraClass: `merged-ares-mlsp-${ln.key}-label merged-ares-mlsp-trade-label`,
            confidence: 0.95,
          })
        );
      }
    }
  }

  return {
    markers,
    overlays,
    result,
    dashboard: result.dashboard,
    summaryKo: result.summaryKo,
  };
}
