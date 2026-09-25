enum MarketBias { long, short, neutral }
enum TradeGate { enter, watch, noTrade }

class StructureOutput {
  final MarketBias bias;
  final String wave; // e.g., "2 of 5" or "B of ABC"
  final String grade; // A~D
  const StructureOutput({required this.bias, required this.wave, required this.grade});
}

class LiquidityOutput {
  final bool whalesOn;
  final int stopHuntRisk; // 0~100
  final List<double> liquidityZones; // price levels
  const LiquidityOutput({required this.whalesOn, required this.stopHuntRisk, required this.liquidityZones});
}

class Scenario {
  final String name; // Main / Alt / Fail
  final MarketBias bias;
  final int probability; // 0~100
  final double target;
  const Scenario({required this.name, required this.bias, required this.probability, required this.target});
}

class ProbabilityOutput {
  final List<Scenario> scenarios; // size=3 recommended
  const ProbabilityOutput({required this.scenarios});
}

class EngineConsensus {
  final MarketBias bias;
  final TradeGate gate;
  final int confidence; // 0~100
  final String reason;
  const EngineConsensus({required this.bias, required this.gate, required this.confidence, required this.reason});
}

class ReactionZone {
  final String tf; // "15m" "1h" ...
  final int reactionProb; // 0~100
  final int strength; // 0~100
  final double level; // price
  const ReactionZone({required this.tf, required this.reactionProb, required this.strength, required this.level});
}

class RiskPlan {
  final double entry;
  final double stop;
  final double tp1;
  final double tp2;
  final double tp3;
  final double positionSizePctSpot;
  final double leverageFutures;
  const RiskPlan({
    required this.entry,
    required this.stop,
    required this.tp1,
    required this.tp2,
    required this.tp3,
    required this.positionSizePctSpot,
    required this.leverageFutures,
  });
}
