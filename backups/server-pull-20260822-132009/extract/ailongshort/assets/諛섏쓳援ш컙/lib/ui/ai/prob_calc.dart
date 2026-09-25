class ProbCalc {
  static ({double reversalPct, double breakoutPct}) splitReversalBreakout({
    required double basePct,
    required bool isResistance,
    required bool trendStrong,
  }) {
    final b = basePct.clamp(0, 100).toDouble();
    double a = b * 0.55;
    double c = b * 0.45;
    if (trendStrong) {
      c += 10;
      a -= 10;
    }
    a = a.clamp(5, 95);
    c = c.clamp(5, 95);
    return (reversalPct: a, breakoutPct: c);
  }

  static List<double> tpProbs({
    required double confidencePct,
    required double distFactor, // 0~1
  }) {
    final c = (confidencePct.clamp(0, 100) / 100.0);
    final d = distFactor.clamp(0.0, 1.0);
    final tp1 = (c * (0.80 + 0.20 * d)) * 100;
    final tp2 = (c * (0.55 + 0.25 * d)) * 100;
    final tp3 = (c * (0.35 + 0.25 * d)) * 100;
    return [tp1.clamp(5, 95), tp2.clamp(3, 90), tp3.clamp(2, 85)];
  }
}