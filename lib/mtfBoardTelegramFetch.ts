import type { AnalyzeResponse } from '@/types';
import type { UserSettings } from '@/lib/settings';
import { tierMaskFromMinTier } from '@/lib/settings';
import { buildTelegramBackgroundAnalyzeUrlWithSettings } from '@/lib/telegramBackgroundAnalyzeQuery';
import {
  digestMtfSignalBoard,
  MTF_SIGNAL_BOARD_TFS,
  type MtfSignalBoardDigest,
} from '@/lib/mtfSignalBoardDigest';

export type MtfBoardDigestRow = { tf: string; digest: MtfSignalBoardDigest };

/**
 * 홈 MTF 패널과 동일: 15m~1M 각각 /api/analyze 후 digest (배치 간 짧은 지연).
 */
export async function fetchMtfBoardDigestRowsForSymbol(params: {
  settings: UserSettings;
  symbol: string;
  baseUrl: string;
  analyzeSecret?: string;
}): Promise<MtfBoardDigestRow[]> {
  const { settings, symbol, baseUrl, analyzeSecret } = params;
  const touchTierMask =
    settings.institutionalBandTouchTierMask ??
    tierMaskFromMinTier(
      settings.institutionalBandTouchMinTier === 'A' ||
        settings.institutionalBandTouchMinTier === 'B' ||
        settings.institutionalBandTouchMinTier === 'C'
        ? settings.institutionalBandTouchMinTier
        : 'B',
    );
  const origin = baseUrl.replace(/\/$/, '');
  const rows: MtfBoardDigestRow[] = [];
  const chunk = 3;
  for (let i = 0; i < MTF_SIGNAL_BOARD_TFS.length; i += chunk) {
    const part = MTF_SIGNAL_BOARD_TFS.slice(i, i + chunk);
    const batch = await Promise.all(
      part.map(async (tf) => {
        const rel = buildTelegramBackgroundAnalyzeUrlWithSettings(settings, symbol, tf, 'FUSION_MODE');
        const url = new URL(rel, `${origin}/`).toString();
        try {
          const res = await fetch(url, {
            cache: 'no-store',
            headers: analyzeSecret ? { 'x-internal-analyze-secret': analyzeSecret } : undefined,
          });
          if (!res.ok) {
            console.error(`[mtfBoardFetch] ${symbol} ${tf} HTTP ${res.status}`);
            return { tf, digest: digestMtfSignalBoard({ timeframe: tf, bandTouchTierMask: touchTierMask }) };
          }
          const d = (await res.json()) as AnalyzeResponse;
          const digest = digestMtfSignalBoard({
            candles: Array.isArray(d.candles) ? d.candles : undefined,
            timeframe: tf,
            structureRocketSignals: d.structureRocketSignals,
            overlays: d.overlays,
            bandTouchTierMask: touchTierMask,
          });
          return { tf, digest };
        } catch (e) {
          console.error(`[mtfBoardFetch] ${symbol} ${tf}`, e);
          return { tf, digest: digestMtfSignalBoard({ timeframe: tf, bandTouchTierMask: touchTierMask }) };
        }
      }),
    );
    rows.push(...batch);
    if (i + chunk < MTF_SIGNAL_BOARD_TFS.length) {
      await new Promise((r) => setTimeout(r, 350));
    }
  }
  return rows;
}
