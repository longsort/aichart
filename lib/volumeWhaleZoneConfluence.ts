/**
 * WAD(거래량 급증 프록시) × 호가·체결 고래 존(StrongZone) 겹침.
 * — CVD/단일 체결 원장 없이도 “존 안에서 공격적 체결이 붙었는지” 정도만 합성.
 */
import type { Candle } from '@/types';
import { evalWadBar, type VolumeHistogramIntelOpts } from '@/lib/volumeHistogramIntelligence';
import {
  candleOverlapsAnyBuyZone,
  candleOverlapsAnySellZone,
  type WhaleZoneBand,
} from '@/lib/volumeZoneOverlap';

export type { WhaleZoneBand };

const DEFAULT_WAD: Partial<VolumeHistogramIntelOpts> = {};

export type VolumeWhaleZoneConfluence = {
  /** API에서 호가·체결 존 파이프라인 결과가 넘어온 경우 */
  zoneDataProvided: boolean;
  lastBarWhaleBuy: boolean;
  lastBarWhaleSell: boolean;
  lastBarInBuyZone: boolean;
  lastBarInSellZone: boolean;
  /** 마지막 봉: WAD BUY + 매수 존 겹침 */
  confluentLong: boolean;
  /** 마지막 봉: WAD SELL + 매도 존 겹침 */
  confluentShort: boolean;
  /** 최근 lookbackBars 봉 중 confluentLong 횟수 */
  recentConfluentLong: number;
  /** 최근 lookbackBars 봉 중 confluentShort 횟수 */
  recentConfluentShort: number;
  /** analyze 신뢰도에 더할 값(이미 클램프 전) */
  confidenceDelta: number;
  /** 확률 엔진 보정용 */
  probabilityLongBonus: number;
  probabilityShortBonus: number;
  /** UI·요약 한 줄 */
  caption: string;
};

const RECENT_BARS = 6;

function scanRecent(
  candles: Candle[],
  buyZones: WhaleZoneBand[],
  sellZones: WhaleZoneBand[],
  wad: Partial<VolumeHistogramIntelOpts>
): { longN: number; shortN: number } {
  const n = candles.length;
  let longN = 0;
  let shortN = 0;
  const from = Math.max(0, n - RECENT_BARS);
  for (let i = from; i < n; i++) {
    const c = candles[i];
    const e = evalWadBar(candles, i, wad);
    if (!e) continue;
    if (e.whaleBuy && candleOverlapsAnyBuyZone(c, buyZones)) longN++;
    if (e.whaleSell && candleOverlapsAnySellZone(c, sellZones)) shortN++;
  }
  return { longN, shortN };
}

/**
 * verdict·신뢰도 보정치. buy/sell 존 배열이 모두 비어 있으면 델타 0(데이터는 왔으나 감지 없음).
 */
export function computeVolumeWhaleZoneConfluence(
  candles: Candle[],
  buyZones: WhaleZoneBand[],
  sellZones: WhaleZoneBand[],
  verdict: 'LONG' | 'SHORT' | 'WATCH',
  wad?: Partial<VolumeHistogramIntelOpts>
): VolumeWhaleZoneConfluence {
  const w = { ...DEFAULT_WAD, ...wad };
  const n = candles.length;
  const empty = !buyZones.length && !sellZones.length;
  const capNote =
    '거래량 급증은 공격적 체결 프록시, 존은 호가·대량체결 축 — 실제 고래/기관 단정은 별도 데이터 필요';

  if (n < 2) {
    return {
      zoneDataProvided: true,
      lastBarWhaleBuy: false,
      lastBarWhaleSell: false,
      lastBarInBuyZone: false,
      lastBarInSellZone: false,
      confluentLong: false,
      confluentShort: false,
      recentConfluentLong: 0,
      recentConfluentShort: 0,
      confidenceDelta: 0,
      probabilityLongBonus: 0,
      probabilityShortBonus: 0,
      caption: empty ? `감지된 호가·체결 고래 존 없음 — ${capNote}` : `캔들 부족 — ${capNote}`,
    };
  }
  const last = candles[n - 1];
  const eLast = evalWadBar(candles, n - 1, w);
  const lastBarWhaleBuy = eLast?.whaleBuy === true;
  const lastBarWhaleSell = eLast?.whaleSell === true;
  const lastBarInBuyZone = candleOverlapsAnyBuyZone(last, buyZones);
  const lastBarInSellZone = candleOverlapsAnySellZone(last, sellZones);
  const confluentLong = lastBarWhaleBuy && lastBarInBuyZone;
  const confluentShort = lastBarWhaleSell && lastBarInSellZone;
  const { longN, shortN } = scanRecent(candles, buyZones, sellZones, w);

  let confidenceDelta = 0;
  let probabilityLongBonus = 0;
  let probabilityShortBonus = 0;

  if (!empty) {
    if (verdict === 'LONG') {
      if (confluentLong) {
        confidenceDelta += 8;
        probabilityLongBonus += 6;
      } else if (longN >= 2) {
        confidenceDelta += 4;
        probabilityLongBonus += 3;
      } else if (lastBarWhaleBuy) {
        confidenceDelta += 2;
        probabilityLongBonus += 1;
      }
      if (confluentShort) {
        confidenceDelta -= 5;
        probabilityShortBonus += 2;
      } else if (shortN >= 2) {
        confidenceDelta -= 2;
      }
    } else if (verdict === 'SHORT') {
      if (confluentShort) {
        confidenceDelta += 8;
        probabilityShortBonus += 6;
      } else if (shortN >= 2) {
        confidenceDelta += 4;
        probabilityShortBonus += 3;
      } else if (lastBarWhaleSell) {
        confidenceDelta += 2;
        probabilityShortBonus += 1;
      }
      if (confluentLong) {
        confidenceDelta -= 5;
        probabilityLongBonus += 2;
      } else if (longN >= 2) {
        confidenceDelta -= 2;
      }
    } else {
      if (confluentLong && !confluentShort) {
        confidenceDelta += 2;
        probabilityLongBonus += 5;
        probabilityShortBonus -= 3;
      } else if (confluentShort && !confluentLong) {
        confidenceDelta += 2;
        probabilityShortBonus += 5;
        probabilityLongBonus -= 3;
      } else if (longN > shortN && longN >= 2) {
        probabilityLongBonus += 3;
        probabilityShortBonus -= 2;
      } else if (shortN > longN && shortN >= 2) {
        probabilityShortBonus += 3;
        probabilityLongBonus -= 2;
      }
    }
  }

  let caption: string;
  if (empty) {
    caption = `감지된 호가·체결 고래 존 없음 — WAD만 참고 — ${capNote}`;
  } else if (confluentLong || confluentShort) {
    caption = `존·거래량 합치: ${confluentLong ? '매수존×WAD BUY' : ''}${confluentLong && confluentShort ? ' · ' : ''}${confluentShort ? '매도존×WAD SELL' : ''} (최근${RECENT_BARS}봉 겹침 롱${longN}/숏${shortN}) — ${capNote}`;
  } else if (longN > 0 || shortN > 0) {
    caption = `최근 ${RECENT_BARS}봉 존·급증 겹침 롱 ${longN} · 숏 ${shortN} — ${capNote}`;
  } else {
    caption = `고래 존은 있으나 최근 봉에서 WAD 급증과 겹침 없음 — ${capNote}`;
  }

  return {
    zoneDataProvided: true,
    lastBarWhaleBuy,
    lastBarWhaleSell,
    lastBarInBuyZone,
    lastBarInSellZone,
    confluentLong,
    confluentShort,
    recentConfluentLong: longN,
    recentConfluentShort: shortN,
    confidenceDelta,
    probabilityLongBonus,
    probabilityShortBonus,
    caption,
  };
}
