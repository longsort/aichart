/// Simple helper to derive reaction/invalid probabilities.
/// You can plug your real model outputs here later.
class FutureProb {
  /// reaction probability (0~100)
  final double reactionPct;

  /// invalid probability (0~100)
  final double invalidPct;

  /// confidence (0~100)
  final double confidencePct;

  const FutureProb({
    required this.reactionPct,
    required this.invalidPct,
    required this.confidencePct,
  });

  /// Minimal safe default from decisionPct (e.g., 0~100) and lock/watch flags.
  factory FutureProb.fromDecision({
    required double decisionPct,
    required bool locked,
    required bool watch,
  }) {
    final p = decisionPct.clamp(0, 100).toDouble();

    if (locked) {
      return FutureProb(
        reactionPct: (p * 0.45).clamp(0, 35),
        invalidPct: 80,
        confidencePct: (p * 0.35).clamp(0, 25),
      );
    }
    if (watch) {
      return FutureProb(
        reactionPct: (p * 0.70).clamp(0, 55),
        invalidPct: 55,
        confidencePct: (p * 0.60).clamp(0, 45),
      );
    }
    return FutureProb(
      reactionPct: (p * 0.95).clamp(20, 90),
      invalidPct: (100 - p).clamp(10, 70),
      confidencePct: (p * 0.90).clamp(20, 95),
    );
  }
}