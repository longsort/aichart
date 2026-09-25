import { normalizeChartTimeframe } from './constants';
import { defaultSettings, type UserSettings } from './settings';
import { MERGED_DESK_SHARED_TELEGRAM_TFS } from '@/lib/mergedDeskSharedTfFeatures';
import { isTelegramAnalyzableSymbol } from '@/lib/analyzeSymbolSupport';

/** 멀티TF 텔레 — 15m·1h·4h·1d·1w·1M */
export const TELEGRAM_MULTITF_ALLOWED_TFS = MERGED_DESK_SHARED_TELEGRAM_TFS;

/**
 * 멀티TF 텔레(클라이언트/서버 공통): 심볼·TF 목록에서 (분석가능 심볼) × (허용 TF) 쌍.
 * BTC/ETH뿐 아니라 알트·USDKRW/CNYKRW 포함.
 */
export function buildTelegramMultiTfPairListFromSettings(st: UserSettings): [string, string][] {
  const syms = st.telegramMultiTfSymbols?.length
    ? st.telegramMultiTfSymbols
    : defaultSettings.telegramMultiTfSymbols;
  const tfs = st.telegramMultiTfTimeframes?.length
    ? st.telegramMultiTfTimeframes
    : defaultSettings.telegramMultiTfTimeframes;
  return buildTelegramMultiTfPairList(syms, tfs);
}

export function buildTelegramMultiTfPairList(symbols: string[], tfs: string[]): [string, string][] {
  const out: [string, string][] = [];
  for (const rawS of symbols) {
    const s = String(rawS || '')
      .trim()
      .toUpperCase();
    if (!s) continue;
    if (!isTelegramAnalyzableSymbol(s)) continue;
    for (const rawTf of tfs) {
      const tf = normalizeChartTimeframe(String(rawTf || ''));
      if (!tf || !TELEGRAM_MULTITF_ALLOWED_TFS.has(tf)) continue;
      out.push([s, tf]);
    }
  }
  return out;
}