/**
 * AVWAP 고앵커 줄 → **zone 면** (숫자 축라벨·화살 기호 금지).
 * 기존 줄선 데이터·합류 엔진 유지. 확정 수익 문구 없음.
 */
import type { Candle, OverlayItem, AnalyzeResponse } from '@/types';
import type { AtlasPulsePriceLine } from '@/lib/monthDeskAtlasPulseDesk';
import type { MergedDeskHotZoneEntryPack } from '@/lib/mergedDeskHotZoneEntry';
import type { MergedDeskAnchoredVwapPack } from '@/lib/mergedDeskAnchoredVwap';
import { mergedDeskAnalyzedZoneSpanTimes } from '@/lib/mergedAnalysisOverlayTimes';
import { buildAvwapEntryCandidatePack } from './avwapEntryCandidate';

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

function lastVwap(line: Array<{ time: number; value: number }>): number | null {
  const p = line[line.length - 1];
  return p && Number.isFinite(p.value) ? p.value : null;
}

function zoneSpan(candles: Candle[]): { t1: number; t2: number } {
  const n = candles.length;
  if (n < 2) {
    const now = Math.floor(Date.now() / 1000);
    return { t1: now - 3600, t2: now };
  }
  const span = mergedDeskAnalyzedZoneSpanTimes(candles, {
    id: 'avwap-level-zone',
    time1: Number(candles[Math.max(0, n - 48)]!.time),
    price1: 1,
    price2: 0,
  });
  if (span && Number(span.t1) > 0 && Number(span.t2) > 0) {
    return { t1: Number(span.t1), t2: Number(span.t2) };
  }
  return {
    t1: Number(candles[Math.max(0, n - 48)]!.time),
    t2: Number(candles[n - 1]!.time),
  };
}

export type AvwapEntryGuidePack = {
  overlays: OverlayItem[];
  /** 축 숫자 알약 금지 — 비우거나 axisLabel:false 만 */
  priceLines: AtlasPulsePriceLine[];
  summaryKo: string;
};

/**
 * 고앵커 AVWAP(초록·분홍줄) → 항상 zone 면.
 * 합류 있으면 롱/숏진입후보, 없으면 관찰/대기 zone.
 */
export function buildAvwapEntryGuidePack(params: {
  candles: Candle[];
  highPack: MergedDeskAnchoredVwapPack | null;
  analysis?: AnalyzeResponse | null;
  hotZone?: MergedDeskHotZoneEntryPack | null;
}): AvwapEntryGuidePack {
  const candles = params.candles ?? [];
  const empty: AvwapEntryGuidePack = {
    overlays: [],
    priceLines: [],
    summaryKo: 'AVWAP zone · 대기',
  };
  if (candles.length < 16 || !params.highPack) return empty;

  const atr = atrApprox(candles);
  const half = Math.max(atr * 0.14, Math.abs(Number(candles[candles.length - 1]?.close) || 1) * 0.0004);
  const { t1, t2 } = zoneSpan(candles);
  const overlays: OverlayItem[] = [];
  const notes: string[] = [];

  const rows: Array<{
    line: Array<{ time: number; value: number }>;
    tag: string;
    tone: 'green' | 'red';
    roleKo: string;
  }> = [
    {
      line: params.highPack.extremeLine,
      tag: 'AVWAP 고·고가',
      tone: 'green',
      roleKo: '고가앵커',
    },
    {
      line: params.highPack.openLine,
      tag: 'AVWAP 고·시가',
      tone: 'red',
      roleKo: '시가앵커',
    },
  ];

  for (const row of rows) {
    const px = lastVwap(row.line);
    if (px == null) continue;
    const entry = buildAvwapEntryCandidatePack({
      candles,
      vwapLine: row.line,
      lineTagKo: row.tag,
      tone: row.tone,
      analysis: params.analysis ?? null,
      hotZone: params.hotZone ?? null,
    });

    const isLongCand = entry.bias === 'long' && entry.entryAllowed;
    const isShortCand = entry.bias === 'short' && entry.entryAllowed;
    const isLongObs = entry.bias === 'long' && !entry.entryAllowed;
    const isShortObs = entry.bias === 'short' && !entry.entryAllowed;

    let face: string;
    let kind: 'demandZone' | 'supplyZone';
    let fill: string;
    let signal: string;
    if (isLongCand) {
      face = `롱진입후보 · ${row.roleKo}`;
      kind = 'demandZone';
      fill = 'rgba(34,197,94,0.30)';
      signal = entry.reasonsKo[0] || '합류';
    } else if (isShortCand) {
      face = `숏진입후보 · ${row.roleKo}`;
      kind = 'supplyZone';
      fill = 'rgba(244,63,94,0.30)';
      signal = entry.reasonsKo[0] || '합류';
    } else if (isLongObs) {
      face = `롱관찰 · ${row.roleKo}`;
      kind = 'demandZone';
      fill = 'rgba(45,212,191,0.22)';
      signal = '합류 부족·대기';
    } else if (isShortObs) {
      face = `숏관찰 · ${row.roleKo}`;
      kind = 'supplyZone';
      fill = 'rgba(251,113,133,0.24)';
      signal = '합류 부족·대기';
    } else {
      face = `VWAP · ${row.roleKo}`;
      kind = row.tone === 'green' ? 'demandZone' : 'supplyZone';
      fill = row.tone === 'green' ? 'rgba(74,222,128,0.18)' : 'rgba(251,113,133,0.20)';
      signal = '앵커평균가 구간';
    }

    const tip = [
      face,
      `${row.tag}`,
      `기준가 ≈ ${px.toFixed(2)} (면으로 표시 · 숫자알약 아님)`,
      ...entry.reasonsKo.slice(0, 5),
      'zone 클릭 시 상세 · 확정 진입 아님',
    ].join('\n');

    overlays.push({
      id: `avwap-entry-guide-${row.tone}-${Math.round(px)}`,
      kind,
      category: 'avwapEntryGuide',
      label: face,
      zoneFaceBase: face,
      zoneFaceSignal: signal,
      zoneFaceDetailKo: tip,
      x1: 0,
      y1: 0,
      x2: 1,
      y2: 0,
      time1: t1,
      time2: t2,
      price1: px + half,
      price2: px - half,
      priceFrozen1: px + half,
      priceFrozen2: px - half,
      confidence: Math.min(88, 36 + entry.longVotes * 8 + entry.shortVotes * 8),
      color: fill,
      labelBackgroundColor: fill,
      labelTextColor: '#f8fafc',
      labelTooltip: tip,
      zoneFillPreserve: true,
      structureBias: kind === 'demandZone' ? 'bullish' : 'bearish',
      overlayZoneExtraClass: [
        'avwap-entry-guide',
        'merged-desk-zone-label-on',
        'merged-desk-zone-pro-hero',
        'merged-desk-money-zone-keep',
        kind === 'demandZone' ? 'hotzone-signal--long' : 'hotzone-signal--short',
      ].join(' '),
      noProject: true,
    } as OverlayItem);

    notes.push(face);
  }

  return {
    overlays: overlays.slice(0, 2),
    /** 축 분홍 숫자 알약 전부 금지 */
    priceLines: [],
    summaryKo: notes.length ? notes.join(' · ') : empty.summaryKo,
  };
}
