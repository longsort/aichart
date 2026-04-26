class RegimeResult {
  final String regime; // TREND / RANGE / CHAOS
  final double score01;

  const RegimeResult(this.regime, this.score01);
}

class RegimeLock {
  RegimeResult detect({
    required double risk01,
    required double momentum,
    required double volSpike01,
  }) {
    if (risk01 >= 0.80 && volSpike01 >= 0.70) {
      return const RegimeResult('CHAOS', 0.90);
    }
    if (momentum >= 0.03 && risk01 <= 0.70) {
      return const RegimeResult('TREND', 0.75);
    }
    return const RegimeResult('RANGE', 0.55);
  }

  bool allowTrade(String decision, RegimeResult r) {
    if (r.regime == 'CHAOS') return false;
    if (decision == 'NO-TRADE') return false;
    return true;
  }
}