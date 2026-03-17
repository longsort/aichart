import '../models/engine_models.dart';

class ConsensusEngine {
  EngineConsensus decide({
    required StructureOutput structure,
    required LiquidityOutput liquidity,
    required ProbabilityOutput prob,
  }) {
    // Simple strict gate: if Structure and MAIN scenario align and stophunt risk acceptable → enter
    final main = prob.scenarios.first;
    final align = structure.bias == main.bias && structure.bias != MarketBias.neutral;
    final tooRisky = liquidity.stopHuntRisk >= 70;

    if (tooRisky) {
      return const EngineConsensus(
        bias: MarketBias.neutral,
        gate: TradeGate.noTrade,
        confidence: 0,
        reason: "StopHuntRisk HIGH",
      );
    }

    if (align && main.probability >= 60) {
      return EngineConsensus(
        bias: main.bias,
        gate: TradeGate.enter,
        confidence: main.probability,
        reason: "Trinity ALIGN + Prob>=60",
      );
    }

    return EngineConsensus(
      bias: main.bias,
      gate: TradeGate.watch,
      confidence: main.probability,
      reason: "Not enough consensus",
    );
  }
}
