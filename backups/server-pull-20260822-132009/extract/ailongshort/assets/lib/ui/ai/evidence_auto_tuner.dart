import 'dart:math' as math;
import '../../data/evidence_weights_db.dart';

/// Evidence auto-tuner
///
/// Input: evidence feature map {key: 0/1 or 0~1}, outcome result
/// Output: updated weights + updated threshold
///
/// Reward mapping (default):
///  TP=+1.0, SL=-1.0, TIMEOUT=-0.35, BE=0.0, CANCEL=0.0
class EvidenceAutoTuner {
  /// Clip ranges
  final double wMin;
  final double wMax;

  /// Threshold clip
  final double thMin;
  final double thMax;

  /// When TP happens -> slightly lower threshold (allow more trades)
  /// When SL happens -> raise threshold (be more selective)
  final double thAdjust;

  const EvidenceAutoTuner({
    this.wMin = -2.0,
    this.wMax = 2.0,
    this.thMin = 45.0,
    this.thMax = 92.0,
    this.thAdjust = 1.2,
  });

  static double rewardOf(String result) {
    final r = result.toUpperCase();
    if (r == 'TP') return 1.0;
    if (r == 'SL') return -1.0;
    if (r == 'TIMEOUT') return -0.35;
    if (r == 'BE') return 0.0;
    return 0.0;
  }

  /// Update weights/state using one finished trade.
  /// features: evidence keys that were active for this trade.
  /// Example keys (추천):
  ///  'BOS', 'CHOCH', 'SWEEP', 'EQH', 'EQL', 'OB', 'FVG', 'BPR', 'REGIME_TREND', 'REGIME_RANGE', ...
  Future<void> updateFromOutcome({
    required String symbol,
    required String tf,
    required Map<String, double> features,
    required String result,
  }) async {
    final reward = rewardOf(result);

    final state = await EvidenceWeightsDb.loadState();
    double threshold = state['threshold'] ?? 70.0;
    final lr = state['lr'] ?? 0.06;
    double baseline = state['baseline'] ?? 0.0;

    // Update baseline (EMA)
    baseline = baseline * 0.9 + reward * 0.1;

    // Advantage
    final adv = reward - baseline;

    // Load current weights
    final w = await EvidenceWeightsDb.loadWeights();

    int updatedCount = 0;
    for (final e in features.entries) {
      final key = e.key;
      final x = e.value; // 0..1
      if (x <= 0) continue;

      final cur = w[key] ?? 0.0;
      final nw = _clamp(cur + lr * adv * x, wMin, wMax);
      if ((nw - cur).abs() > 1e-9) {
        await EvidenceWeightsDb.upsertWeight(key, nw);
        updatedCount += 1;
      }
    }

    // Adjust threshold
    double deltaTh = 0.0;
    if (reward >= 0.9) {
      deltaTh = -thAdjust; // allow slightly more
    } else if (reward <= -0.9) {
      deltaTh = thAdjust;  // be stricter
    } else if (reward < -0.2) {
      deltaTh = thAdjust * 0.35;
    } else if (reward > 0.2) {
      deltaTh = -thAdjust * 0.15;
    }

    final newTh = _clamp(threshold + deltaTh, thMin, thMax);

    await EvidenceWeightsDb.saveState(
      threshold: newTh,
      lr: lr,
      baseline: baseline,
    );

    await EvidenceWeightsDb.insertTuneLog(
      symbol: symbol,
      tf: tf,
      result: result,
      reward: reward,
      deltaThreshold: newTh - threshold,
      note: 'weights+$updatedCount adv=${adv.toStringAsFixed(2)} base=${baseline.toStringAsFixed(2)}',
    );
  }

  /// Compute weighted score (0~100)
  /// baseScore: 기존 evidence_score (0~100) 있으면 그대로 넣고, 없으면 0.
  /// weights are small (-2..2) so we scale modestly.
  Future<double> weightedScore({
    required Map<String, double> features,
    double baseScore = 0.0,
  }) async {
    final w = await EvidenceWeightsDb.loadWeights();
    double s = baseScore;

    double sum = 0;
    for (final e in features.entries) {
      final x = e.value;
      if (x <= 0) continue;
      sum += (w[e.key] ?? 0.0) * x;
    }

    // scale: each 1.0 weight ~ +4 pts
    s += sum * 4.0;

    return _clamp(s, 0.0, 100.0);
  }

  Future<double> currentThreshold() async {
    final st = await EvidenceWeightsDb.loadState();
    return st['threshold'] ?? 70.0;
  }

  static double _clamp(double v, double a, double b) => math.max(a, math.min(b, v));
}