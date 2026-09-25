class AutoDecision {
  final String decision; // LONG/SHORT/NO-TRADE
  final int confidence;
  final String reason;

  const AutoDecision(this.decision, this.confidence, this.reason);
}

class FullAutoEngine {
  AutoDecision finalize({
    required String decision,
    required int confidence,
    required String regime,
    required bool noTradeLocked,
    required int evidenceHit,
    required int evidenceTotal,
  }) {
    if (noTradeLocked) return const AutoDecision('NO-TRADE', 10, 'no-trade-lock');
    if (regime == 'CHAOS') return const AutoDecision('NO-TRADE', 15, 'regime-chaos');

    // require evidence >= 6/10 to trade
    if (evidenceTotal > 0 && evidenceHit < 6) {
      return AutoDecision('NO-TRADE', (confidence * 0.6).round(), 'evidence-low');
    }

    // confidence floor
    if (confidence < 55) {
      return AutoDecision('NO-TRADE', confidence, 'confidence-low');
    }

    return AutoDecision(decision, confidence, 'ok');
  }
}