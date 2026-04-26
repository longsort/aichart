import '../models/engine_models.dart';

class RiskEngine {
  // 5% fixed risk model
  RiskPlan buildPlan({
    required double entry,
    required double stop,
    required double price,
  }) {
    // Spot position sizing: simplified placeholder
    // distance percent
    final dist = (entry - stop).abs() / entry;
    final spotPct = dist <= 0 ? 0.0 : (0.05 / dist).clamp(0.0, 1.0) * 100.0;

    // Futures leverage: simplified placeholder
    final lev = dist <= 0 ? 1.0 : (0.05 / dist).clamp(1.0, 25.0);

    return RiskPlan(
      entry: entry,
      stop: stop,
      tp1: price * 1.012,
      tp2: price * 1.02,
      tp3: price * 1.035,
      positionSizePctSpot: double.parse(spotPct.toStringAsFixed(1)),
      leverageFutures: double.parse(lev.toStringAsFixed(1)),
    );
  }
}
