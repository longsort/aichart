/**
 * Bitget 고래 DNA — UI 패널 (실제 CSV 구간 · 롱빔/숏빔 · +N봉 참고)
 */
import type { WhaleVolumeMtfPack, WhaleVolumeLiveMatch } from '@/lib/bitgetWhaleVolumeCatalog';
import type { RangeSegmentCompare, SingleCandleCompare } from '@/lib/bitgetWhaleVolumeCompare';
import type { WhaleBeamIntelPack } from '@/lib/whaleVolumeBeamIntel';

export type BitgetWhaleDnaPanel = {
  beamKo: string;
  verdictKo: string;
  longPct: number;
  shortPct: number;
  similarCount: number;
  forecastBars: number;
  forecastPct: number | null;
  p25Pct: number | null;
  p75Pct: number | null;
  tierBtc: number;
  sampleCount: number;
  dataSpanKo: string;
  mtfLine: string;
  pastLine: string;
  scenarioKo: string;
  entryKo: string;
  targetKo: string;
  footerKo: string;
};

export function buildBitgetWhaleDnaNarrative(dna: BitgetWhaleDnaPanel): string {
  const dir =
    dna.verdictKo === '상승'
      ? '상방'
      : dna.verdictKo === '하락'
        ? '하방'
        : '중립';
  const pct = fmtPct(dna.forecastPct);
  const band =
    dna.p25Pct != null && dna.p75Pct != null
      ? ` (참고 밴드 ${fmtPct(dna.p25Pct)}~${fmtPct(dna.p75Pct)})`
      : '';
  const simLine =
    dna.similarCount > 0
      ? `유사 ${dna.similarCount}건`
      : dna.sampleCount > 0
        ? `카탈로그 ${dna.sampleCount}건`
        : '표본 수집 중';
  return [
    `Bitget ${dna.tierBtc}BTC ${dna.beamKo} · ${dna.scenarioKo}.`,
    `${simLine} 기준 +${dna.forecastBars}봉 ${dir} ${pct}${band}.`,
    `롱 ${dna.longPct.toFixed(0)}% / 숏 ${dna.shortPct.toFixed(0)}% — 조건부 참고, 확정 아님.`,
  ].join(' ');
}

function fmtPct(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`;
}

function fmtPrice(p: number): string {
  if (!Number.isFinite(p) || p <= 0) return '—';
  if (p >= 1000) return p.toLocaleString('en-US', { maximumFractionDigits: 0 });
  return p.toFixed(2);
}

export function resolveWhaleSimilarCount(params: {
  single?: SingleCandleCompare | null;
  range?: RangeSegmentCompare | null;
  similarHistoryCount?: number;
  live?: { sampleCount?: number; bucket?: { sampleCount?: number } | null } | null;
}): number {
  const bucketN = params.live?.bucket?.sampleCount ?? params.live?.sampleCount ?? 0;
  return Math.max(
    params.single?.similarCount ?? 0,
    params.range?.similarCount ?? 0,
    params.similarHistoryCount ?? 0,
    bucketN
  );
}

export function buildBitgetWhaleDnaPanel(params: {
  intel: WhaleBeamIntelPack | null;
  single?: SingleCandleCompare | null;
  range?: RangeSegmentCompare | null;
  mtf?: WhaleVolumeMtfPack | null;
  dataSpanKo?: string;
  similarHistoryCount?: number;
  match?: WhaleVolumeLiveMatch | null;
}): BitgetWhaleDnaPanel | null {
  const { intel, single, range, mtf, dataSpanKo, similarHistoryCount, match } = params;
  const live = intel?.live;
  if (!live) return null;

  const h = live.forecastBars;
  const band =
    range?.forecasts.find((f) => f.bars === h) ??
    single?.forecasts.find((f) => f.bars === h) ??
    range?.forecasts[0] ??
    single?.forecasts[0];

  const similarCount = resolveWhaleSimilarCount({
    single,
    range,
    similarHistoryCount,
    live: match ?? live,
  });
  const forecastPct = band?.medianPct ?? live.forecastPct;
  const p25 = band?.p25Pct ?? null;
  const p75 = band?.p75Pct ?? null;

  const mtfBits: string[] = [];
  if (mtf?.rows?.length) {
    for (const r of mtf.rows) {
      if (!r.ok || !r.match) continue;
      const dom = r.match.dominant === 'LONG' ? 'L' : r.match.dominant === 'SHORT' ? 'S' : 'N';
      mtfBits.push(`${r.tf} ${dom}${Math.round(Math.max(r.match.longPct, r.match.shortPct))}`);
    }
  }

  const topPast = range?.similarRanges?.[0];
  const pastLine = topPast
    ? `${topPast.dateKo} ${fmtPct(topPast.afterPct)} (유사${Math.round(topPast.similarityPct)}%)`
    : '—';

  const scenarioKo = range?.scenarioKo ?? single?.burstKo ?? live.segKind ?? '횡보박스';
  const beamKo = live.beamKo !== '관망' ? live.beamKo : live.verdictKo === '상승' ? '롱빔' : live.verdictKo === '하락' ? '숏빔' : '관망';

  const span =
    dataSpanKo ??
    (intel.catalogBars ? `${intel.listingFromKo}~ · ${intel.catalogBars.toLocaleString()}봉` : intel.listingFromKo);

  const footerKo = `${live.verdictKo} · ${live.move.tierLabel} ${live.move.pctLabel} · n${live.sampleCount}`;

  return {
    beamKo,
    verdictKo: live.verdictKo,
    longPct: live.move.longPct,
    shortPct: live.move.shortPct,
    similarCount,
    forecastBars: h,
    forecastPct,
    p25Pct: p25,
    p75Pct: p75,
    tierBtc: live.tierBtc,
    sampleCount: match?.sampleCount ?? live.sampleCount,
    dataSpanKo: span,
    mtfLine: mtfBits.length ? mtfBits.join(' · ') : '—',
    pastLine,
    scenarioKo,
    entryKo: `${live.move.entryKo} ${fmtPrice(live.entryPrice)}`,
    targetKo: `${fmtPrice(live.targetPrice)} (${live.move.pctLabel})`,
    footerKo,
  };
}
