/**
 * Phase 21 — Visual layout contract (pixel diff 보조).
 * Reference: TOP gauges / MAIN candles / RIGHT battle / BOTTOM plan+status
 * Heat는 캔들 면 가림 금지.
 */
export type Eagle1VisualRegion =
  | 'header'
  | 'gauges'
  | 'chart'
  | 'side'
  | 'plan'
  | 'stats'
  | 'events'
  | 'research';

export type Eagle1VisualContract = {
  regions: Eagle1VisualRegion[];
  heatCoverCandlesForbidden: true;
  whaleCardUiForbidden: true;
  maxDiffRatio: number;
  referenceHint: string;
  summaryKo: string;
};

export const EAGLE1_VISUAL_CONTRACT: Eagle1VisualContract = {
  regions: ['header', 'gauges', 'chart', 'side', 'plan', 'stats', 'events', 'research'],
  heatCoverCandlesForbidden: true,
  whaleCardUiForbidden: true,
  maxDiffRatio: 0.42,
  referenceHint: 'public/mockups/eagle1-ai-hud-reference.png',
  summaryKo:
    'TOP gauges · MAIN candles+alerts · RIGHT squeeze · BOTTOM plan · HTF SUPPLY/DEMAND · TP dotted · heat strip only',
};

export type VisualSelftestResult = {
  ok: boolean;
  fails: string[];
  contract: Eagle1VisualContract;
};

export function runVisualLayoutSelftest(params?: {
  heatCoverCandles?: boolean;
  hasWhaleCardUi?: boolean;
  regionsPresent?: Eagle1VisualRegion[];
}): VisualSelftestResult {
  const fails: string[] = [];
  if (params?.heatCoverCandles) fails.push('VISUAL FAIL · heat covers candles');
  if (params?.hasWhaleCardUi) fails.push('VISUAL FAIL · whale card/HUD/rail forbidden');
  const present = new Set(params?.regionsPresent ?? EAGLE1_VISUAL_CONTRACT.regions);
  for (const r of ['header', 'chart', 'plan'] as Eagle1VisualRegion[]) {
    if (!present.has(r)) fails.push(`VISUAL FAIL · missing region ${r}`);
  }
  return {
    ok: fails.length === 0,
    fails,
    contract: EAGLE1_VISUAL_CONTRACT,
  };
}
