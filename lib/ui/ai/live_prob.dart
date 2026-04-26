/// Live probability updater (fast heuristic)
/// - When approaching a zone, update reaction probability smoothly
/// - When entering, boost reaction prob briefly
/// - When exiting without reaction, reduce
class LiveProb {
  double reactionPct = 50;
  double invalidPct = 50;

  /// Update given base confidence and approachScore 0~1
  void update({
    required double baseConfidencePct,
    required double approachScore,
    required bool insideZone,
    bool entered = false,
    bool exited = false,
  }) {
    final base = baseConfidencePct.clamp(0, 100).toDouble();

    // approach increases reaction probability
    final targetReaction = (base * (0.70 + 0.30 * approachScore)).clamp(10, 95);

    // smooth
    reactionPct = reactionPct + (targetReaction - reactionPct) * 0.18;

    // enter/exit spikes
    if (entered) reactionPct = (reactionPct + 8).clamp(10, 95);
    if (exited && !insideZone) reactionPct = (reactionPct - 6).clamp(5, 95);

    invalidPct = (100 - reactionPct).clamp(5, 95);
  }
}