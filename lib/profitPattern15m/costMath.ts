/**
 * 50x NET+5% 필요 가격변동 역산 · SL/TP 가격.
 */
import {
  PP_LEVERAGE,
  PP_PAPER_MAKER_FEE,
  PP_TARGET_NET_ROE_PCT,
} from '@/lib/profitPattern15m/paperPolicy';

export type PpCostConfig = {
  leverage: number;
  targetNetRoePct: number;
  entryFeeRate: number;
  exitFeeRate: number;
  slipBpsEntry: number;
  slipBpsExit: number;
};

export function defaultPpCostConfig(overrides?: Partial<PpCostConfig>): PpCostConfig {
  return {
    leverage: PP_LEVERAGE,
    targetNetRoePct: PP_TARGET_NET_ROE_PCT,
    entryFeeRate: PP_PAPER_MAKER_FEE,
    exitFeeRate: PP_PAPER_MAKER_FEE,
    slipBpsEntry: 1,
    slipBpsExit: 1,
    ...overrides,
  };
}

export function computeRequiredMoveForNet(cfg: PpCostConfig) {
  const lev = Math.max(1, cfg.leverage);
  const feeImpact = (cfg.entryFeeRate + cfg.exitFeeRate) * lev * 100;
  const slipFrac = cfg.slipBpsEntry / 10_000 + cfg.slipBpsExit / 10_000;
  const slipImpact = slipFrac * lev * 100;
  const requiredMoveFrac =
    cfg.targetNetRoePct / (lev * 100) +
    cfg.entryFeeRate +
    cfg.exitFeeRate +
    slipFrac;
  return {
    requiredMoveFrac,
    requiredMovePct: requiredMoveFrac * 100,
    feeImpactRoePct: feeImpact,
    slipImpactRoePct: slipImpact,
    targetNetRoePct: cfg.targetNetRoePct,
    leverage: lev,
    detailKo: `NET${cfg.targetNetRoePct}%@${lev}x → 가격≈${(requiredMoveFrac * 100).toFixed(3)}% · 수수료ROE ${feeImpact.toFixed(1)}%p · 슬립 ${slipImpact.toFixed(1)}%p`,
  };
}

export function tpPriceFromEntry(
  direction: 'LONG' | 'SHORT',
  entry: number,
  requiredMoveFrac: number
): number {
  if (direction === 'LONG') return entry * (1 + requiredMoveFrac);
  return entry * (1 - requiredMoveFrac);
}

export function slPriceFromEntry(
  direction: 'LONG' | 'SHORT',
  entry: number,
  slFrac: number
): number {
  if (direction === 'LONG') return entry * (1 - slFrac);
  return entry * (1 + slFrac);
}

export function netRoePctFromPriceMove(priceRetFrac: number, cfg: PpCostConfig): number {
  const lev = Math.max(1, cfg.leverage);
  const fee = (cfg.entryFeeRate + cfg.exitFeeRate) * lev * 100;
  const slip =
    (cfg.slipBpsEntry / 10_000 + cfg.slipBpsExit / 10_000) * lev * 100;
  return priceRetFrac * lev * 100 - fee - slip;
}
