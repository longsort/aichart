/**
 * 통합·분석 — 하단 거래량 막대 AI 해석 · MTF · 과거 비교
 */
import type { Candle } from '@/types';
import type { WhaleVolumeMtfPack } from '@/lib/bitgetWhaleVolumeCatalog';
import type { RangeSegmentCompare, SingleCandleCompare } from '@/lib/bitgetWhaleVolumeCompare';
import type { BitgetWhaleDnaPanel } from '@/lib/bitgetWhaleDnaPanel';
import type { VolumePhaseMtfBundle } from '@/lib/volumePhaseMtf';
import { volumePhaseStatsTfLabel } from '@/lib/volumePhaseTimeframes';
import {
  detectVolumeHighlightSegments,
  estimateBarBuySell,
  formatVolumeSegmentKo,
  type VolumeSegmentDirectionStats,
} from '@/lib/volumeDirectionStats';
import {
  sanitizeChartCandlesForSeries,
  smaTotalVolumeAt,
  wadBuyVolume,
  wadSellVolume,
} from '@/lib/volumeHistogramIntelligence';

export type VolumeBarLegendItem = {
  swatch: string;
  labelKo: string;
  detailKo: string;
};

export type VolumeMtfAiRow = {
  tf: string;
  tfKo: string;
  rvol: number | null;
  rvolKo: string;
  whaleDom: 'LONG' | 'SHORT' | 'NEUTRAL' | null;
  whaleTierBtc: number | null;
  phaseKo: string | null;
  headlineKo: string;
};

export type VolumePastCompareRow = {
  dateKo: string;
  volLabel: string;
  rvol: number | null;
  afterPct: number | null;
  similarityPct: number | null;
};

export type MergedDeskVolumeAiPack = {
  narrativeKo: string;
  legend: VolumeBarLegendItem[];
  current: {
    volLabel: string;
    buyLabel: string;
    sellLabel: string;
    rvol: number | null;
    rvolPctile: number | null;
    vsPastKo: string;
    directionKo: string;
    candleKo: string;
  };
  mtfRows: VolumeMtfAiRow[];
  pastRows: VolumePastCompareRow[];
  segments: VolumeSegmentDirectionStats[];
  dataSpanKo: string;
};

const MTF_DISPLAY = ['1m', '1h', '1d', '1w', '1M'] as const;

export const VOLUME_BAR_LEGEND_BITGET: VolumeBarLegendItem[] = [
  { swatch: '#22C55E', labelKo: '상승볼륨', detailKo: '매수 우세 ≥55% — taker buy 또는 체결 위치 추정' },
  { swatch: '#EF4444', labelKo: '하락볼륨', detailKo: '매도 우세 ≥55%' },
  { swatch: '#FBBF24', labelKo: '혼조', detailKo: '매수·매도 45~55% — 방향 불명확' },
  { swatch: '#14B8A6', labelKo: 'RVOL↑', detailKo: '평균 대비 거래량 급증 — 진할수록 강함' },
  { swatch: '#22d3ee', labelKo: '롱빔', detailKo: 'Bitget 고래 매수 클러스터' },
  { swatch: '#f97316', labelKo: '숏빔', detailKo: 'Bitget 고래 매도 클러스터' },
];

function fmtBtc(v: number): string {
  if (!Number.isFinite(v) || v <= 0) return '0';
  if (v >= 100) return v.toFixed(0);
  if (v >= 10) return v.toFixed(1);
  return v.toFixed(2);
}

function rvolAt(candles: Candle[], idx: number, period = 20): number | null {
  const sma = smaTotalVolumeAt(candles, idx, period);
  const v = Math.max(0, candles[idx]?.volume || 0);
  if (sma <= 0 || v <= 0) return null;
  return v / sma;
}

function rvolPercentile(candles: Candle[], idx: number, lookback = 100, period = 20): number | null {
  const from = Math.max(period - 1, idx - lookback + 1);
  const cur = rvolAt(candles, idx, period);
  if (cur == null) return null;
  const samples: number[] = [];
  for (let i = from; i <= idx; i++) {
    const r = rvolAt(candles, i, period);
    if (r != null) samples.push(r);
  }
  if (samples.length < 8) return null;
  const below = samples.filter((x) => x <= cur).length;
  return Math.round((below / samples.length) * 100);
}

function candleShapeKo(c: Candle): string {
  const o = Number(c.open);
  const cl = Number(c.close);
  const hi = Number(c.high);
  const lo = Number(c.low);
  if (![o, cl, hi, lo].every(Number.isFinite)) return '—';
  const rng = Math.max(1e-9, hi - lo);
  const body = Math.abs(cl - o) / rng;
  const bull = cl >= o;
  if (body < 0.15) return '도지';
  if (body < 0.45) return bull ? '소양' : '소음';
  if (body < 0.68) return bull ? '중양' : '중음';
  return bull ? '장양' : '장음';
}

function buildMtfRows(
  chartTf: string,
  candles: Candle[],
  mtf: WhaleVolumeMtfPack | null,
  phaseBundle: VolumePhaseMtfBundle | null
): VolumeMtfAiRow[] {
  const chartRows = sanitizeChartCandlesForSeries(candles, chartTf);
  const lastIdx = chartRows.length - 1;

  return MTF_DISPLAY.map((tf) => {
    const tfKo = volumePhaseStatsTfLabel(tf);
    const whaleRow = mtf?.rows.find((r) => r.tf === tf);
    const phaseRow = phaseBundle?.rows.find((r) => r.timeframe === tf);

    let rvol: number | null = null;
    if (tf === chartTf && lastIdx >= 19) {
      rvol = rvolAt(chartRows, lastIdx);
    } else if (whaleRow?.match?.currentRvol != null) {
      rvol = whaleRow.match.currentRvol;
    }

    const dom = whaleRow?.match?.dominant ?? null;
    const tier = whaleRow?.match?.tierBtc ?? null;
    const phaseKo = phaseRow?.current?.label ?? phaseRow?.headlineKo?.split('·')[0]?.trim() ?? null;

    let headlineKo = '데이터 없음';
    if (whaleRow?.ok && whaleRow.match && whaleRow.match.sampleCount >= 3) {
      const d = dom === 'LONG' ? '롱' : dom === 'SHORT' ? '숏' : '중립';
      headlineKo = `${d} ${Math.round(Math.max(whaleRow.match.longPct, whaleRow.match.shortPct))}% · ${whaleRow.match.tierBtc}BTC`;
    } else if (phaseRow?.ok && phaseRow.headlineKo) {
      headlineKo = phaseRow.headlineKo.length > 28 ? `${phaseRow.headlineKo.slice(0, 28)}…` : phaseRow.headlineKo;
    } else if (rvol != null) {
      headlineKo = `RVOL ${rvol.toFixed(1)}×`;
    }

    return {
      tf,
      tfKo,
      rvol,
      rvolKo: rvol != null ? `${rvol.toFixed(1)}×` : '—',
      whaleDom: dom,
      whaleTierBtc: tier,
      phaseKo,
      headlineKo,
    };
  });
}

function buildPastRows(
  range: RangeSegmentCompare | null,
  single: SingleCandleCompare | null,
  candles: Candle[],
  chartTf: string
): VolumePastCompareRow[] {
  const fromRange =
    range?.similarRanges?.slice(0, 8).map((r) => ({
      dateKo: r.dateKo,
      volLabel: `${fmtBtc(r.totalVolBtc)} BTC`,
      rvol: null as number | null,
      afterPct: r.afterPct,
      similarityPct: r.similarityPct,
    })) ?? [];

  if (fromRange.length >= 3) return fromRange;

  const rows = sanitizeChartCandlesForSeries(candles, chartTf);
  const n = rows.length;
  if (n < 30) return fromRange;

  const last = rows[n - 1]!;
  const lastVol = Math.max(0, last.volume || 0);
  const peaks: Array<{ idx: number; vol: number }> = [];
  for (let i = Math.max(20, n - 400); i < n - 1; i++) {
    peaks.push({ idx: i, vol: Math.max(0, rows[i]!.volume || 0) });
  }
  peaks.sort((a, b) => b.vol - a.vol);
  const top = peaks.slice(0, 6);

  return top.map(({ idx, vol }) => {
    const c = rows[idx]!;
    const t = new Date(Number(c.time) * 1000);
    const dateKo = `${t.getUTCFullYear()}.${String(t.getUTCMonth() + 1).padStart(2, '0')}.${String(t.getUTCDate()).padStart(2, '0')}`;
    const rvol = rvolAt(rows, idx);
    const afterIdx = Math.min(n - 1, idx + 8);
    const p0 = c.close;
    const p1 = rows[afterIdx]?.close ?? p0;
    const afterPct = p0 > 0 ? ((p1 - p0) / p0) * 100 : null;
    const sim = lastVol > 0 ? Math.min(99, (Math.min(vol, lastVol) / Math.max(vol, lastVol)) * 100) : null;
    return {
      dateKo,
      volLabel: `${fmtBtc(vol)} (${((vol / Math.max(lastVol, 1e-9)) * 100).toFixed(0)}%)`,
      rvol,
      afterPct,
      similarityPct: sim,
    };
  });
}

function buildNarrative(params: {
  current: MergedDeskVolumeAiPack['current'];
  dna: BitgetWhaleDnaPanel | null;
  range: RangeSegmentCompare | null;
  chartTf: string;
  mtfRows: VolumeMtfAiRow[];
}): string {
  const { current, dna, range, chartTf, mtfRows } = params;
  const tfKo = volumePhaseStatsTfLabel(chartTf);
  const parts: string[] = [];

  parts.push(
    `${tfKo}봉 거래량 ${current.volLabel} — ${current.directionKo} ${current.candleKo}, ${current.vsPastKo}.`
  );
  parts.push(
    '막대 색: 녹=상승(매수)볼륨 우세 · 적=하락(매도)볼륨 우세 · 황=혼조. taker buy 또는 체결위치로 통계 분류.'
  );

  if (dna) {
    parts.push(
      `DNA ${dna.beamKo} · 유사 ${dna.similarCount}건 +${dna.forecastBars}봉 ${dna.verdictKo} ${dna.forecastPct != null ? `${dna.forecastPct >= 0 ? '+' : ''}${dna.forecastPct.toFixed(1)}%` : '—'}(참고).`
    );
  }

  const aligned = mtfRows.filter((r) => r.whaleDom === 'LONG' || r.whaleDom === 'SHORT');
  if (aligned.length >= 2) {
    const longN = aligned.filter((r) => r.whaleDom === 'LONG').length;
    const shortN = aligned.filter((r) => r.whaleDom === 'SHORT').length;
    parts.push(`MTF 고래 ${longN}TF 롱 / ${shortN}TF 숏 — 단일 TF만으로 단정하지 마세요.`);
  }

  if (range?.similarCount) {
    parts.push(`과거 유사 ${range.bars}봉 구간 ${range.similarCount}건 — ${range.volTrendKo}.`);
  }

  parts.push('조건부 참고·검증 필요, 확정·승률 아님.');
  return parts.join(' ');
}

export function buildMergedDeskVolumeAiPack(params: {
  candles: Candle[];
  chartTf: string;
  dna: BitgetWhaleDnaPanel | null;
  single: SingleCandleCompare | null;
  range: RangeSegmentCompare | null;
  mtf: WhaleVolumeMtfPack | null;
  phaseBundle: VolumePhaseMtfBundle | null;
  dataSpanKo?: string;
}): MergedDeskVolumeAiPack | null {
  const { candles, chartTf, dna, single, range, mtf, phaseBundle, dataSpanKo } = params;
  const rows = sanitizeChartCandlesForSeries(candles, chartTf);
  if (rows.length < 5) return null;

  const lastIdx = rows.length - 1;
  const last = rows[lastIdx]!;
  const lastSplit = estimateBarBuySell(last);
  const buy = wadBuyVolume(last);
  const sell = wadSellVolume(last);
  const vol = Math.max(0, last.volume || 0);
  const rvol = rvolAt(rows, lastIdx);
  const pctile = rvolPercentile(rows, lastIdx);

  const directionKo =
    lastSplit.direction === 'buy'
      ? '상승(매수) 거래량'
      : lastSplit.direction === 'sell'
        ? '하락(매도) 거래량'
        : '매수·매도 혼조';
  const vsPastKo =
    rvol != null && pctile != null
      ? `평균 ${rvol.toFixed(1)}× · 최근 ${pctile}백분위`
      : rvol != null
        ? `평균 ${rvol.toFixed(1)}×`
        : '비교 데이터 부족';

  const mtfRows = buildMtfRows(chartTf, rows, mtf, phaseBundle);
  const pastRows = buildPastRows(range, single, rows, chartTf);

  const current = {
    volLabel: single ? `${fmtBtc(single.volBtc)} BTC` : `${fmtBtc(vol)}`,
    buyLabel: single ? `${fmtBtc(single.buyBtc)} BTC` : `${fmtBtc(buy)}`,
    sellLabel: single ? `${fmtBtc(single.sellBtc)} BTC` : `${fmtBtc(sell)}`,
    rvol,
    rvolPctile: pctile,
    vsPastKo,
    directionKo,
    candleKo: single?.candleKo ?? candleShapeKo(last),
  };

  const segments = detectVolumeHighlightSegments(rows);
  const baseNarrative = buildNarrative({ current, dna, range, chartTf, mtfRows });
  const narrativeKo =
    segments.length > 0
      ? `${baseNarrative} 구간: ${segments.map(formatVolumeSegmentKo).join(' · ')}.`
      : baseNarrative;

  return {
    narrativeKo,
    legend: VOLUME_BAR_LEGEND_BITGET,
    current,
    mtfRows,
    pastRows,
    segments,
    dataSpanKo: dataSpanKo ?? dna?.dataSpanKo ?? '',
  };
}
