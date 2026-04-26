import 'tf_aggregator.dart';

class ProbResult {
  final double upPct;
  final double downPct;

  const ProbResult({required this.upPct, required this.downPct});
}

class ProbabilityEngine {
  ProbResult compute(TfAgg agg) {
    // Simple, stable baseline: map momentum to probability
    final m = agg.momentum;
    final up01 = (0.5 + m).clamp(0.0, 1.0) as double;
    final upPct = up01 * 100.0;
    final downPct = (1.0 - up01) * 100.0;
    return ProbResult(upPct: upPct, downPct: downPct);
  }
}
