/**
 * 기관밴드(ST) 터치 — 화살/숏ST 글자 마커 대신 **zone 면**.
 * ↓ 동그라미·분홍 화살 = 상단 저항 터치 → supply zone.
 * ↑ = 하단 지지 터치 → demand zone.
 * 엔진·터치 데이터 유지. 확정 수익 문구 없음.
 */
import type { Candle, OverlayItem, AnalyzeResponse } from '@/types';
import {
  computeInstitutionalBandInteractionMarkersUnion,
  computeInstitutionalSuperTrendMeta,
  computeInstitutionalSuperTrendCore,
  INSTITUTIONAL_BAND_DEFAULT_MULT,
  INSTITUTIONAL_BAND_DEFAULT_PERIOD,
  institutionalBandTouchMinGapBars,
  type InstitutionalBandInteractionMarker,
} from '@/lib/institutionalSuperBand';
import type { InstitutionalBandTouchTierMask } from '@/lib/settings';
import { tierMaskFromMinTier } from '@/lib/settings';
import { sanitizeChartCandlesForSeries } from '@/lib/volumeHistogramIntelligence';
import { mergedDeskAnalyzedZoneSpanTimes } from '@/lib/mergedAnalysisOverlayTimes';
import { humanizeBandPartKo } from '@/lib/chartFeatureExplain';
import {
  computePriceBandSrProb,
  computeInstitutionalBandSrProb,
  appendSrProbToLabel,
} from '@/lib/zoneSupportResistProb';

/**
 * 기관밴드(ST) 터치 — zone 면(옵션) + **캔들 compact 마커(LH★/SH◆)** 공용.
 * false = 마감·안착·융합과 동일하게 LH/SH/LP/SP 캔들 라벨 표시.
 */
export const MERGED_DESK_ST_TOUCH_AS_ZONES = false;

function atrApprox(candles: Candle[]): number {
  const n = candles.length;
  if (n < 16) return Math.abs(Number(candles[n - 1]?.close) || 1) * 0.004;
  let s = 0;
  let c = 0;
  for (let i = Math.max(1, n - 15); i < n - 1; i++) {
    const a = candles[i]!;
    const b = candles[i - 1]!;
    const tr = Math.max(
      Number(a.high) - Number(a.low),
      Math.abs(Number(a.high) - Number(b.close)),
      Math.abs(Number(a.low) - Number(b.close))
    );
    if (Number.isFinite(tr)) {
      s += tr;
      c += 1;
    }
  }
  return c > 0 ? s / c : Math.abs(Number(candles[n - 1]?.close) || 1) * 0.004;
}

function zoneSpanAroundBar(candles: Candle[], barTime: number): { t1: number; t2: number } {
  const n = candles.length;
  if (n < 2) {
    const now = Math.floor(Date.now() / 1000);
    return { t1: now - 3600, t2: now };
  }
  const idx = candles.findIndex((c) => Number(c.time) === barTime);
  const i = idx >= 0 ? idx : n - 1;
  const left = Math.max(0, i - 8);
  const right = Math.min(n - 1, Math.max(i + 2, n - 1));
  const span = mergedDeskAnalyzedZoneSpanTimes(candles, {
    id: 'st-band-touch-zone',
    time1: Number(candles[left]!.time),
    price1: 1,
    price2: 0,
  });
  if (span && Number(span.t1) > 0 && Number(span.t2) > 0) {
    return { t1: Number(span.t1), t2: Number(span.t2) };
  }
  return {
    t1: Number(candles[left]!.time),
    t2: Number(candles[right]!.time),
  };
}

function faceForEv(ev: InstitutionalBandInteractionMarker): {
  face: string;
  signal: string;
  kind: 'demandZone' | 'supplyZone';
  fill: string;
} {
  const grade = ev.tier === 'A' ? '강' : ev.tier === 'B' ? '중' : '약';
  const sHint = ev.confluence?.grade === 'S' ? '·합류' : '';
  if (ev.verdict === 'LONG') {
    return {
      face: `기관지지 · 롱터치${grade}${sHint}`,
      signal: humanizeBandPartKo(ev.summaryParts[0] || '') || '지지 반응',
      kind: 'demandZone',
      fill:
        ev.tier === 'A'
          ? 'rgba(45,212,191,0.32)'
          : ev.tier === 'B'
            ? 'rgba(20,184,166,0.26)'
            : 'rgba(13,148,136,0.20)',
    };
  }
  return {
    face: `기관저항 · 숏터치${grade}${sHint}`,
    signal: humanizeBandPartKo(ev.summaryParts[0] || '') || '저항 거절',
    kind: 'supplyZone',
    fill:
      ev.tier === 'A'
        ? 'rgba(244,114,182,0.34)'
        : ev.tier === 'B'
          ? 'rgba(251,113,133,0.28)'
          : 'rgba(225,29,72,0.22)',
  };
}

/**
 * ST 터치 이벤트 → zone overlays (최근 N개만 — 차트 과밀 방지).
 */
export function buildMergedDeskInstitutionalBandZones(params: {
  candles: Candle[];
  timeframe: string;
  analysis?: AnalyzeResponse | null;
  touchTierMask?: InstitutionalBandTouchTierMask | null;
  maxZones?: number;
}): OverlayItem[] {
  const safe = sanitizeChartCandlesForSeries(params.candles);
  if (safe.length < 7) return [];

  const mask = params.touchTierMask ?? tierMaskFromMinTier('B');
  const overlayList = params.analysis?.overlays ?? ([] as OverlayItem[]);
  const ibMarks = computeInstitutionalBandInteractionMarkersUnion(
    safe,
    INSTITUTIONAL_BAND_DEFAULT_PERIOD,
    INSTITUTIONAL_BAND_DEFAULT_MULT,
    {
      minBarsBetween: institutionalBandTouchMinGapBars(params.timeframe),
      tierEnabled: {
        A: mask.A === true,
        B: mask.B === true,
        C: mask.C === true,
      },
      overlays: overlayList,
    }
  );

  const atr = atrApprox(safe);
  const meta = computeInstitutionalSuperTrendMeta(
    safe,
    INSTITUTIONAL_BAND_DEFAULT_PERIOD,
    INSTITUTIONAL_BAND_DEFAULT_MULT
  );
  const bandPx = meta.lastLinePrice;
  const half = Math.max(atr * 0.16, Math.abs(Number(safe[safe.length - 1]?.close) || 1) * 0.00045);
  const maxZ = Math.max(1, Math.min(6, params.maxZones ?? 4));

  const stCore = computeInstitutionalSuperTrendCore(
    safe,
    INSTITUTIONAL_BAND_DEFAULT_PERIOD,
    INSTITUTIONAL_BAND_DEFAULT_MULT
  );
  const bandSr =
    stCore != null
      ? computeInstitutionalBandSrProb(safe, stCore.finalLower, stCore.finalUpper)
      : null;

  /** 최근 터치 우선 */
  const sorted = [...ibMarks].sort((a, b) => Number(b.time) - Number(a.time)).slice(0, maxZ);
  const out: OverlayItem[] = [];

  for (const ev of sorted) {
    const tm = Number(ev.time);
    if (!Number.isFinite(tm)) continue;
    const bar = safe.find((c) => Number(c.time) === tm) ?? safe[safe.length - 1]!;
    /** 터치 봉 high/low 근처 + 밴드가 있으면 밴드 중심 */
    let mid =
      ev.verdict === 'SHORT'
        ? Number(bar.high)
        : Number(bar.low);
    if (bandPx != null && Number.isFinite(bandPx)) {
      mid = (mid + bandPx) / 2;
    }
    if (!(mid > 0)) continue;

    const { face, signal, kind, fill } = faceForEv(ev);
    const { t1, t2 } = zoneSpanAroundBar(safe, tm);
    const local = computePriceBandSrProb(safe, mid - half, mid + half);
    const supportProb =
      ev.verdict === 'LONG'
        ? bandSr?.supportProb ?? local.supportProb
        : local.supportProb;
    const resistanceProb =
      ev.verdict === 'SHORT'
        ? bandSr?.resistanceProb ?? local.resistanceProb
        : local.resistanceProb;
    const faceWithProb = appendSrProbToLabel(face, {
      supportProb: ev.verdict === 'LONG' ? supportProb : null,
      resistanceProb: ev.verdict === 'SHORT' ? resistanceProb : null,
      labelKo: '',
    });
    const parts = (ev.summaryParts || []).map(humanizeBandPartKo).filter(Boolean).slice(0, 5);
    const tip = [
      faceWithProb,
      `등급 ${ev.tier} · 품질 ${ev.score}`,
      bandSr?.labelKo || local.labelKo,
      ...parts,
      ev.confluence
        ? `다축합류 ${ev.confluence.grade} · ${ev.confluence.total}`
        : '',
      '실측 지지/저항% · 확정 숏/롱 아님',
    ]
      .filter(Boolean)
      .join('\n');

    out.push({
      id: `st-band-touch-zone-${ev.verdict === 'LONG' ? 'l' : 's'}-${tm}-${ev.tier}`,
      kind,
      category: 'institutionalSrBand',
      label: faceWithProb,
      zoneFaceBase: faceWithProb,
      zoneFaceSignal:
        ev.verdict === 'LONG'
          ? supportProb != null
            ? `지지${supportProb}%`
            : signal
          : resistanceProb != null
            ? `저항${resistanceProb}%`
            : signal,
      zoneFaceDetailKo: tip,
      x1: 0,
      y1: 0,
      x2: 1,
      y2: 0,
      time1: t1,
      time2: t2,
      price1: mid + half,
      price2: mid - half,
      priceFrozen1: mid + half,
      priceFrozen2: mid - half,
      confidence: Math.min(
        90,
        Math.max(
          40,
          (ev.verdict === 'LONG' ? supportProb : resistanceProb) ?? ev.score
        )
      ),
      supportProb,
      resistanceProb,
      probSamples:
        ev.verdict === 'LONG'
          ? bandSr?.supportTouches ?? local.supportTouches
          : bandSr?.resistTouches ?? local.resistTouches,
      color: fill,
      labelBackgroundColor: fill,
      labelTextColor: '#f8fafc',
      labelTooltip: tip,
      zoneFillPreserve: true,
      structureBias: kind === 'demandZone' ? 'bullish' : 'bearish',
      overlayZoneExtraClass: [
        'st-band-touch-zone',
        'merged-desk-zone-label-on',
        'merged-desk-zone-pro-hero',
        'merged-desk-rb-kit-band',
        kind === 'demandZone' ? 'hotzone-signal--long' : 'hotzone-signal--short',
      ].join(' '),
      noProject: true,
    } as OverlayItem);
  }

  return out;
}
