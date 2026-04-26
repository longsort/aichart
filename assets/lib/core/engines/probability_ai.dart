import '../models/engine_models.dart';

class ProbabilityAI {
  ProbabilityOutput analyze({required double price, required MarketBias biasHint}) {
    // TODO: replace with statistical model + evidence scoring
    final base = biasHint == MarketBias.long ? 62 : (biasHint == MarketBias.short ? 60 : 50);

    return ProbabilityOutput(scenarios: [
      Scenario(name: "MAIN", bias: biasHint == MarketBias.neutral ? MarketBias.long : biasHint, probability: base, target: price * 1.015),
      Scenario(name: "ALT", bias: MarketBias.neutral, probability: 100 - base - 10, target: price * 1.005),
      Scenario(name: "FAIL", bias: biasHint == MarketBias.long ? MarketBias.short : MarketBias.long, probability: 10, target: price * 0.985),
    ]);
  }
}
