/**
 * 텔레그램 자동알림 — 심볼·가격 혼입 방지 (BTC/ETH/알트/환율).
 */
import type { AnalyzeResponse } from '@/types';
import { isForexSymbol } from '@/lib/forexMarket';
import { normalizeAnalyzeSymbol } from '@/lib/analyzeSymbolSupport';

export function normalizeTelegramSymbol(symbol: string): string {
  return normalizeAnalyzeSymbol(symbol);
}

/** 심볼 계열에 맞는 가격대 (자산 혼입 차단) */
export function telegramAssetPricePlausible(symbol: string, price: number): boolean {
  if (!(price > 0) || !Number.isFinite(price)) return false;
  const s = normalizeTelegramSymbol(symbol);
  if (s.startsWith('BTC')) return price >= 1_000 && price <= 1_000_000;
  if (s.startsWith('ETH')) return price >= 50 && price <= 50_000;
  if (s === 'USDKRW' || s === 'KRWUSD') return price >= 800 && price <= 3_000;
  if (s === 'CNYKRW') return price >= 100 && price <= 500;
  if (isForexSymbol(s)) return price > 0 && price < 1_000_000;
  if (s.endsWith('USDT')) {
    /** 알트 — 와이드 밴드 (저가 밈 ~ 고가 메이저) */
    return price > 0 && price <= 1_000_000;
  }
  return true;
}

/** 기준가 대비 과도하게 동떨어진 가격(다른 자산) 여부 */
export function telegramPriceCompatibleWithAnchor(
  anchor: number,
  price: number,
  maxRatio = 4
): boolean {
  if (!(anchor > 0) || !(price > 0)) return false;
  if (!Number.isFinite(anchor) || !Number.isFinite(price)) return false;
  const ratio = price / anchor;
  return ratio >= 1 / maxRatio && ratio <= maxRatio;
}

export function analysisMatchesTelegramSymbol(
  analysis: AnalyzeResponse | null | undefined,
  symbol: string
): boolean {
  if (!analysis) return false;
  const want = normalizeTelegramSymbol(symbol);
  const got = normalizeTelegramSymbol(String(analysis.symbol || ''));
  if (!want || !got) return false;
  if (want === got) return true;
  /** BTCUSDT ↔ BTCUSDT.P 등 */
  if (want.startsWith('BTC') && got.startsWith('BTC')) return true;
  if (want.startsWith('ETH') && got.startsWith('ETH')) return true;
  /** 동일 베이스 (SOLUSDT ↔ SOL) */
  const wantBase = want.endsWith('USDT') ? want.slice(0, -4) : want;
  const gotBase = got.endsWith('USDT') ? got.slice(0, -4) : got;
  if (wantBase && gotBase && wantBase === gotBase) return true;
  if (isForexSymbol(want) && isForexSymbol(got) && want === got) return true;
  return false;
}

/** 분석 응답의 현재가·캔들이 요청 심볼 가격대와 맞는지 */
export function analysisPriceMatchesTelegramSymbol(
  analysis: AnalyzeResponse,
  symbol: string
): boolean {
  const px = Number(analysis.currentPrice);
  if (px > 0 && !telegramAssetPricePlausible(symbol, px)) return false;
  const candles = (analysis as AnalyzeResponse & { candles?: Array<{ close?: number }> }).candles;
  if (Array.isArray(candles) && candles.length) {
    const last = Number(candles[candles.length - 1]?.close);
    if (last > 0 && !telegramAssetPricePlausible(symbol, last)) return false;
    if (px > 0 && last > 0 && !telegramPriceCompatibleWithAnchor(last, px, 1.5)) return false;
  }
  return true;
}

export function filterTelegramPricesToSymbolScale<T>(
  symbol: string,
  anchor: number,
  items: T[],
  getPrice: (item: T) => number
): T[] {
  const base =
    anchor > 0 && telegramAssetPricePlausible(symbol, anchor)
      ? anchor
      : items.map(getPrice).find((p) => telegramAssetPricePlausible(symbol, p)) || 0;
  if (!(base > 0)) return [];
  return items.filter((it) => {
    const p = getPrice(it);
    return telegramAssetPricePlausible(symbol, p) && telegramPriceCompatibleWithAnchor(base, p);
  });
}

/** 단일 가격 — 심볼 스케일·앵커 비율 밖이면 null (ETH에 BTC TP 혼입 차단) */
export function sanitizeTelegramPrice(
  symbol: string,
  anchor: number,
  price: number | null | undefined
): number | null {
  if (price == null || !(Number(price) > 0) || !Number.isFinite(Number(price))) return null;
  const p = Number(price);
  if (!telegramAssetPricePlausible(symbol, p)) return null;
  if (anchor > 0 && !telegramPriceCompatibleWithAnchor(anchor, p)) return null;
  return p;
}

export type TelegramSanitizeLevelsIn = {
  entry?: number | null;
  sl?: number | null;
  tp1?: number | null;
  tp2?: number | null;
  tp3?: number | null;
  inv?: number | null;
};

export type TelegramSanitizeLevelsOut = {
  entry: number | null;
  sl: number | null;
  tp1: number | null;
  tp2: number | null;
  tp3: number | null;
  inv: number | null;
};

/** E/SL/TP/무효 — 심볼·현재가와 안 맞는 값은 전부 */
export function sanitizeTelegramTradeLevels(
  symbol: string,
  anchor: number,
  levels: TelegramSanitizeLevelsIn | null | undefined
): TelegramSanitizeLevelsOut {
  const empty: TelegramSanitizeLevelsOut = {
    entry: null,
    sl: null,
    tp1: null,
    tp2: null,
    tp3: null,
    inv: null,
  };
  if (!levels) return empty;
  return {
    entry: sanitizeTelegramPrice(symbol, anchor, levels.entry),
    sl: sanitizeTelegramPrice(symbol, anchor, levels.sl),
    tp1: sanitizeTelegramPrice(symbol, anchor, levels.tp1),
    tp2: sanitizeTelegramPrice(symbol, anchor, levels.tp2),
    tp3: sanitizeTelegramPrice(symbol, anchor, levels.tp3),
    inv: sanitizeTelegramPrice(symbol, anchor, levels.inv),
  };
}
