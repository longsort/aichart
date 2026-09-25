import '../models/engine_models.dart';

class LiquidityAI {
  // TODO: replace with orderbook/liquidity/CVD inputs
  LiquidityOutput analyze({required List<double> highs, required List<double> lows}) {
    final stopHuntRisk = (highs.isEmpty || lows.isEmpty) ? 50 : 35;
    final zones = <double>[];
    if (highs.isNotEmpty) zones.add(highs.last);
    if (lows.isNotEmpty) zones.add(lows.last);
    return LiquidityOutput(
      whalesOn: true,
      stopHuntRisk: stopHuntRisk,
      liquidityZones: zones,
    );
  }
}
