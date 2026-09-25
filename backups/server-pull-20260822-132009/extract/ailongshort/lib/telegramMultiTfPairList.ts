import { normalizeChartTimeframe } from './constants';
import { defaultSettings, type UserSettings } from './settings';
import { MERGED_DESK_SHARED_TELEGRAM_TFS } from '@/lib/mergedDeskSharedTfFeatures';

/** 멀티TF 텔레 — 통합분석과 동일하게 1m~1M 전 TF */
export const TELEGRAM_MULTITF_ALLOWED_TFS = MERGED_DESK_SHARED_TELEGRAM_TFS;

/**
 * 멀티TF 텔레(클라이언트/서버 공통): 심볼·TF 목록에서 (BTC/ETH) × (허용 TF) 쌍.
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
    if (!s.startsWith('BTC') && !s.startsWith('ETH')) continue;
    for (const rawTf of tfs) {
      const tf = normalizeChartTimeframe(String(rawTf || ''));
      if (!tf || !TELEGRAM_MULTITF_ALLOWED_TFS.has(tf)) continue;
      out.push([s, tf]);
    }
  }
  return out;
}