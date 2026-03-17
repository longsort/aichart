import 'evidence_weight_store.dart';

class EvidenceLearner {
  static const double minW = 0.50;
  static const double maxW = 1.50;

  /// Update weights using a snapshot's evidence flags and its outcome.
  /// - WIN: reinforce +0.02
  /// - LOSS: penalize -0.03
  Future<Map<String, double>> update({
    required Map<String, double> current,
    required Map<String, dynamic>? flags,
    required String outcome, // 'WIN' or 'LOSS'
  }) async {
    if (flags == null || flags.isEmpty) return current;

    final next = Map<String, double>.from(current);
    final delta = (outcome == 'WIN') ? 0.02 : -0.03;

    for (final e in flags.entries) {
      final key = e.key.toString();
      final ok = e.value == true;
      if (!ok) continue; // only reinforce/penalize evidence that was ON
      final cur = next[key] ?? 1.0;
      final upd = (cur + delta).clamp(minW, maxW);
      next[key] = upd.toDouble();
    }

    await EvidenceWeightStore.I.save(next);
    return next;
  }

  double weightedScore({
    required Map<String, double> weights,
    required Map<String, dynamic>? flags,
  }) {
    if (flags == null || flags.isEmpty) return 0;
    double s = 0;
    double total = 0;
    for (final e in flags.entries) {
      final key = e.key.toString();
      final w = weights[key] ?? 1.0;
      total += w;
      if (e.value == true) s += w;
    }
    if (total <= 0) return 0;
    return s / total; // 0~1
  }
}