/// Simple probability mapper for zones/entries.
/// Replace with your real model later.
class ProbMapper {
  /// From evidence score (0~100) + lock/watch state -> prob(0~100)
  static double probFromScore({
    required double score,
    required bool locked,
    required bool watch,
  }) {
    final s = score.clamp(0, 100).toDouble();
    if (locked) return (s * 0.35).clamp(0, 30);
    if (watch) return (s * 0.65).clamp(10, 55);
    return (s * 0.92).clamp(20, 92);
  }

  /// Resistance probability tends to be slightly lower in strong trends;
  /// keep as a small adjustment hook.
  static double resistanceProb(double base, {double trendPenalty = 6}) {
    return (base - trendPenalty).clamp(5, 95);
  }
}