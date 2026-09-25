import type { AnalyzeResponse } from '@/types';

/** 텔레 자동·멀티TF: 롱/숏 “확정” 신호가 분석 JSON에 있을 때만 true */
export type LsConfirmFlags = { long: boolean; short: boolean };

export function getTelegramLsConfirmFlags(
  analysis: AnalyzeResponse | null | undefined
): LsConfirmFlags {
  if (!analysis) return { long: false, short: false };
  const h = analysis.smartOverlay?.confirmation?.headline;
  const z = analysis.zoneSignal?.zone;
  const fr = analysis.frontRunSignal as
    | { state?: string; direction?: string }
    | undefined;
  const ai = analysis.aiFusionSignal as { verdict?: string; tier?: string } | undefined;
  const tier = String(ai?.tier ?? '').toLowerCase();
  const long =
    h === 'BULL_CONFIRM' ||
    z === 'long_confirm' ||
    (fr?.state === 'TRIGGERED' && fr?.direction === 'LONG') ||
    (tier === 'confirmed' && ai?.verdict === 'LONG');
  const short =
    h === 'BEAR_CONFIRM' ||
    z === 'short_confirm' ||
    (fr?.state === 'TRIGGERED' && fr?.direction === 'SHORT') ||
    (tier === 'confirmed' && ai?.verdict === 'SHORT');
  return { long, short };
}

export function telegramLsConfirmedForDirection(
  direction: 'LONG' | 'SHORT',
  flags: LsConfirmFlags
): boolean {
  return direction === 'LONG' ? flags.long : flags.short;
}
