import 'tf_aggregator.dart';
import 'probability_engine.dart';

class RiskEngine {
  // Returns 0..1
  double compute({required TfAgg agg, required ProbResult prob}) {
    final down01 = (prob.downPct / 100.0).clamp(0.0, 1.0) as double;
    final m = agg.momentum.abs();
    return (down01 * (1.0 + m)).clamp(0.0, 1.0) as double;
  }
}
