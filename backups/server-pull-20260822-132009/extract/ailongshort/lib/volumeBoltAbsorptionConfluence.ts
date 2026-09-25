/**
 * 기관밴드 S등급 합류(차트 ⚡) 봉 주변에 방향 일치 흡수(ABS)가 있으면
 * 거래량·가격에 별도 이모티콘 마커 — 참고용, 확정·승률 보장 없음.
 */
import type { UTCTimestamp } from 'lightweight-charts';
import type { Candle, OverlayItem } from '@/types';
import {
  buildVolumeAbsorptionMarkers,
  sanitizeChartCandlesForSeries,
  type VolumePanelMarker,
} from '@/lib/volumeHistogramIntelligence';
import {
  computeInstitutionalBandInteractionMarkersUnion,
  INSTITUTIONAL_BAND_DEFAULT_MULT,
  INSTITUTIONAL_BAND_DEFAULT_PERIOD,
  institutionalBandTouchMinGapBars,
} from '@/lib/institutionalSuperBand';

export type BoltEvent = { time: number; verdict: 'LONG' | 'SHORT' };

/** 기관밴드 S등급 합류(차트 ⚡) 터치 시각 — 분석 TF·오버레이 일치 시에만 */
export function collectInstitutionalGradeSBoltEvents(
  candles: Candle[],
  params: {
    timeframe: string;
    overlays: OverlayItem[];
    tierMask: { A: boolean; B: boolean; C: boolean };
  }
): BoltEvent[] {
  if (candles.length < 7) return [];
  const safe = sanitizeChartCandlesForSeries(candles);
  const ibMarks = computeInstitutionalBandInteractionMarkersUnion(
    safe,
    INSTITUTIONAL_BAND_DEFAULT_PERIOD,
    INSTITUTIONAL_BAND_DEFAULT_MULT,
    {
      minBarsBetween: institutionalBandTouchMinGapBars(params.timeframe),
      tierEnabled: params.tierMask,
      overlays: params.overlays,
    }
  );
  return ibMarks
    .filter((e) => e.confluence?.grade === 'S')
    .map((e) => ({ time: Number(e.time), verdict: e.verdict }));
}

export type BoltAbsorptionCandleMarker = {
  time: UTCTimestamp;
  position: 'aboveBar' | 'belowBar';
  shape: 'circle';
  color: string;
  text: string;
  size: number;
};

export type BoltAbsorptionConfluenceResult = {
  volume: VolumePanelMarker[];
  candle: BoltAbsorptionCandleMarker[];
  /** 봉 클릭 패널용 */
  detailLines: Array<{ time: number; line: string }>;
};

function absorptionMatchesVerdict(absText: string, verdict: 'LONG' | 'SHORT'): boolean {
  const t = String(absText || '');
  if (verdict === 'LONG') return t.includes('↑') || /\bABS\s*↑/i.test(t);
  return t.includes('↓') || /\bABS\s*↓/i.test(t);
}

/**
 * @param boltEvents S등급 합류(번개) 기관밴드 터치 이벤트
 * @param windowBars 번개 봉 기준 ±몇 봉 안에서 흡수 검색
 */
export function buildBoltAbsorptionConfluence(
  candles: Candle[],
  boltEvents: BoltEvent[],
  partial?: {
    volSmaPeriod?: number;
    windowBars?: number;
    textLong?: string;
    textShort?: string;
    translateKo?: boolean;
  }
): BoltAbsorptionConfluenceResult {
  const safe = sanitizeChartCandlesForSeries(candles);
  const n = safe.length;
  const empty: BoltAbsorptionConfluenceResult = { volume: [], candle: [], detailLines: [] };
  if (n < 8 || !boltEvents.length) return empty;

  const win = Math.max(0, Math.min(8, Math.floor(partial?.windowBars ?? 3)));
  const volPeriod = Math.max(8, Math.min(60, Math.floor(partial?.volSmaPeriod ?? 20)));
  const absMk = buildVolumeAbsorptionMarkers(safe, { volSmaPeriod: volPeriod });
  const absAtTime = new Map<number, string>();
  for (const m of absMk) absAtTime.set(Number(m.time), String(m.text ?? ''));

  const idxOf = new Map<number, number>();
  safe.forEach((c, i) => idxOf.set(Number(c.time), i));

  const ko = partial?.translateKo !== false;
  const textL = partial?.textLong ?? (ko ? '🟢상승존' : '🟢↗');
  const textS = partial?.textShort ?? (ko ? '🔴압력' : '🔴↘');

  const volume: VolumePanelMarker[] = [];
  const candle: BoltAbsorptionCandleMarker[] = [];
  const detailLines: Array<{ time: number; line: string }> = [];
  const seenVol = new Set<number>();

  for (const ev of boltEvents) {
    const t0 = Number(ev.time);
    const idx = idxOf.get(t0);
    if (idx == null) continue;

    const from = Math.max(0, idx - win);
    const to = Math.min(n - 1, idx + win);
    let matched = false;
    for (let j = from; j <= to; j++) {
      const txt = absAtTime.get(Number(safe[j].time));
      if (!txt) continue;
      if (absorptionMatchesVerdict(txt, ev.verdict)) {
        matched = true;
        break;
      }
    }
    if (!matched) continue;

    const ts = safe[idx].time as UTCTimestamp;
    const tnum = Number(ts);
    if (!seenVol.has(tnum)) {
      seenVol.add(tnum);
      volume.push({
        time: ts,
        position: 'aboveBar',
        shape: 'square',
        color: ev.verdict === 'LONG' ? 'rgba(34,197,94,0.9)' : 'rgba(239,68,68,0.9)',
        text: ev.verdict === 'LONG' ? textL : textS,
        size: 2,
      });
    }

    candle.push({
      time: ts,
      position: ev.verdict === 'LONG' ? 'belowBar' : 'aboveBar',
      shape: 'circle',
      color: ev.verdict === 'LONG' ? '#22c55e' : '#ef4444',
      text: ev.verdict === 'LONG' ? textL : textS,
      size: 1,
    });

    detailLines.push({
      time: tnum,
      line:
        ev.verdict === 'LONG'
          ? ko
            ? '번개×흡수: 지지·상승 존 후보(거래량 구간) — 참고·무효는 구조·이탈로 별도 확인'
            : 'Bolt×absorption: rising-zone support candidate — reference only'
          : ko
            ? '번개×흡수: 저항·하락 압력 후보 — 참고·무효는 구조·이탈로 별도 확인'
            : 'Bolt×absorption: resistance pressure candidate — reference only',
    });
  }

  return { volume, candle, detailLines };
}
