/**
 * BTC 15m 거래량(녹/빨/노랑) × RVOL × 41배 ROE(8%/10%) 도달 통계 · 진입 설계.
 * UI: 카드/HUD 금지 — 거래량 막대색·저널 통계줄·가격선만.
 * 확정 승률·수익 아님.
 */
import type { Candle } from '@/types';
import { estimateBarBuySell } from '@/lib/volumeDirectionStats';
import { smaTotalVolumeAt } from '@/lib/volumeHistogramIntelligence';

export const VOL_ROE_LEV = 41;
export const VOL_ROE_TARGETS = [8, 10] as const;
/** 15m 봉 수 → 1h / 2h / 4h / 8h */
export const VOL_ROE_HORIZONS_15M = [4, 8, 16, 32] as const;
export const VOL_ROE_RVOL_MIN_ENTRY = 3;
export const VOL_ROE_RVOL_SMA = 20;

/** 41배에서 ROE% → 필요 가격 변동률(0~1) */
export function priceFracForRoe(roePct: number, leverage: number = VOL_ROE_LEV): number {
  const lev = Math.max(1, leverage);
  return Math.max(0.0001, Number(roePct) / 100 / lev);
}

export type VolBarTone = 'buy' | 'sell' | 'mixed';

export function toneKo(t: VolBarTone): string {
  if (t === 'buy') return '매수(녹/노랑-매수우세)';
  if (t === 'sell') return '매도(빨)';
  return '혼합(노랑)';
}

export type VolRoeBarSnap = {
  idx: number;
  time: number;
  tone: VolBarTone;
  buyPct: number;
  rvol: number;
  volume: number;
  close: number;
};

export function snapVolBarAt(candles: Candle[], idx: number): VolRoeBarSnap | null {
  const c = candles[idx];
  if (!c || idx < VOL_ROE_RVOL_SMA - 1) return null;
  const sma = smaTotalVolumeAt(candles, idx, VOL_ROE_RVOL_SMA);
  const vol = Math.max(0, Number(c.volume) || 0);
  if (!(sma > 0) || !(vol > 0)) return null;
  const split = estimateBarBuySell(c);
  return {
    idx,
    time: Number(c.time) || 0,
    tone: split.direction,
    buyPct: split.buyPct,
    rvol: vol / sma,
    volume: vol,
    close: Number(c.close) || 0,
  };
}

/**
 * 진입 후보 게이트 (설계용 · 자동주문 연결은 사용자 지시 후).
 * - RVOL ≥ 3
 * - 빨강(sell) → 숏 후보 · 녹(buy) → 롱 후보
 * - 노랑(mixed) 단독 진입 금지
 */
export function volBurstEntryBias(snap: VolRoeBarSnap): {
  allow: boolean;
  direction: 'LONG' | 'SHORT' | null;
  reasonKo: string;
} {
  if (snap.rvol < VOL_ROE_RVOL_MIN_ENTRY) {
    return { allow: false, direction: null, reasonKo: `RVOL ${snap.rvol.toFixed(1)} < ${VOL_ROE_RVOL_MIN_ENTRY}` };
  }
  if (snap.tone === 'mixed') {
    return { allow: false, direction: null, reasonKo: '노랑(혼합) 단독진입 금지' };
  }
  if (snap.tone === 'sell') {
    return {
      allow: true,
      direction: 'SHORT',
      reasonKo: `빨강매도우세 · RVOL ${snap.rvol.toFixed(1)}× · 숏후보`,
    };
  }
  return {
    allow: true,
    direction: 'LONG',
    reasonKo: `녹매수우세 · RVOL ${snap.rvol.toFixed(1)}× · 롱후보`,
  };
}

export type VolRoeForwardHit = {
  horizonBars: number;
  roePct: number;
  longHit: boolean;
  shortHit: boolean;
  mfeLongPct: number;
  mfeShortPct: number;
};

/** 마감봉 idx 이후 창에서 ROE 목표 도달 여부 */
export function forwardRoeHits(params: {
  candles: Candle[];
  idx: number;
  leverage?: number;
  horizons?: readonly number[];
  roeTargets?: readonly number[];
}): VolRoeForwardHit[] {
  const candles = params.candles;
  const i = params.idx;
  const entry = Number(candles[i]?.close) || 0;
  if (!(entry > 0)) return [];
  const lev = params.leverage ?? VOL_ROE_LEV;
  const horizons = params.horizons ?? VOL_ROE_HORIZONS_15M;
  const targets = params.roeTargets ?? VOL_ROE_TARGETS;
  const out: VolRoeForwardHit[] = [];
  for (const h of horizons) {
    const win = candles.slice(i + 1, i + 1 + h);
    if (win.length < h) continue;
    const hi = Math.max(...win.map((c) => Number(c.high) || 0));
    const lo = Math.min(...win.map((c) => Number(c.low) || Infinity));
    const mfeLongPct = ((hi - entry) / entry) * 100;
    const mfeShortPct = ((entry - lo) / entry) * 100;
    for (const roe of targets) {
      const need = priceFracForRoe(roe, lev);
      out.push({
        horizonBars: h,
        roePct: roe,
        longHit: hi >= entry * (1 + need),
        shortHit: lo <= entry * (1 - need),
        mfeLongPct,
        mfeShortPct,
      });
    }
  }
  return out;
}

/**
 * 기능 설계 요약 (구현 체크리스트).
 * 1) 스캔 API: /api/merged-desk/vol-roe-stats?symbol=BTCUSDT&tf=15m
 * 2) 저널/자동매매 탭에 한 줄: "15m 빨 RVOL≥3 → 8%ROE 숏 도달률 xx% (n=)"
 * 3) 진입 합류: BTC 꼬리·추정70 또는 폭락확정 + 이 볼륨 게이트
 * 4) 로켓: 기존 3m/5m 로켓과 AND (볼륨만으로 로켓 대체 금지)
 * 5) TP: 1차 ROE8 · 2차 ROE10은 도달률 낮으면 부분만
 */
export const VOL_ROE_FEATURE_DESIGN_KO = [
  '데이터: Bitget 15m OHLCV · 막대색=estimateBarBuySell(녹/빨/노랑)',
  '폭발: RVOL=volume/SMA20 · 진입필터 기본 ≥3',
  '목표: 41배 ROE 8%≈가격0.195% · 10%≈0.244%',
  '합류: 볼륨방향 + (BTC)15m꼬리·추정70 또는 폭락확정 + 선택적 로켓동의',
  '표시: 거래량색·마커·저널 통계줄만 · 카드/HUD 금지',
  '검증: 표본 구간 hitRate·n 표시 · 확정 승률 문구 금지',
] as const;
