import 'tf_aggregator.dart';
import 'probability_engine.dart';
import 'whale_classifier.dart';
import 'risk_engine.dart';

class CoreSnapshot {
  final String tf;
  final double breakoutUpPct;
  final double breakoutDownPct;
  final String whaleGrade;
  final double momentum;
  final double risk01;

  const CoreSnapshot({
    required this.tf,
    required this.breakoutUpPct,
    required this.breakoutDownPct,
    required this.whaleGrade,
    required this.momentum,
    required this.risk01,
  });
}

class CoreEngine {
  final TfAggregator _tf = TfAggregator();
  final ProbabilityEngine _prob = ProbabilityEngine();
  final WhaleClassifier _whale = WhaleClassifier();
  final RiskEngine _risk = RiskEngine();

  CoreSnapshot analyze({
    required String tf,
    required List<double> prices,
    required List<double> volumes,
  }) {
    final agg = _tf.aggregate(tf: tf, prices: prices, volumes: volumes);
    final prob = _prob.compute(agg);
    final whale = _whale.classify(volumes);
    final risk = _risk.compute(agg: agg, prob: prob);

    return CoreSnapshot(
      tf: tf,
      breakoutUpPct: prob.upPct,
      breakoutDownPct: prob.downPct,
      whaleGrade: whale,
      momentum: agg.momentum,
      risk01: risk,
    );
  }
}
