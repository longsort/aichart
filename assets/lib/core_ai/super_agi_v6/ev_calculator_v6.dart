// Super AGI v6 Adapter Core (EV)
// Pure math only.

class EVResult {
  final double evR;     // Expected Value in R (e.g., +0.32R)
  final bool isPositive;
  const EVResult(this.evR, this.isPositive);
}

class EVCalculatorV6 {
  /// EV = (pWin * rewardR) - ((1 - pWin) * riskR)
  /// pWin: 0.0~1.0
  /// rewardR: expected reward in R
  /// riskR: loss in R (usually 1.0 because risk is fixed to 5%)
  static EVResult compute({
    required double pWin,
    required double rewardR,
    double riskR = 1.0,
  }) {
    final pw = _clamp01(pWin);
    final ev = (pw * rewardR) - ((1.0 - pw) * riskR);
    return EVResult(ev, ev > 0);
  }

  static double _clamp01(double x) {
    if (x < 0) return 0;
    if (x > 1) return 1;
    return x;
  }
}
