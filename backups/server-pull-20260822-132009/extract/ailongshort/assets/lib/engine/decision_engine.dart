
class Decision {
  final String side; // LONG / SHORT / WAIT
  final double confidence;

  Decision(this.side, this.confidence);
}

class DecisionEngine {
  static Decision decide({
    required double supportProb,
    required double resistanceProb,
  }) {
    if (supportProb > resistanceProb && supportProb >= 0.6) {
      return Decision('LONG', supportProb);
    }
    if (resistanceProb > supportProb && resistanceProb >= 0.6) {
      return Decision('SHORT', resistanceProb);
    }
    return Decision('WAIT', (supportProb + resistanceProb)/2);
  }
}
