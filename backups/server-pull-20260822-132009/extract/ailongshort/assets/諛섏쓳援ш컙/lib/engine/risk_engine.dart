
class RiskPlan {
  final double entry;
  final double stop;
  final double target;
  final double leverage;

  RiskPlan(this.entry, this.stop, this.target, this.leverage);
}

class RiskEngine {
  static RiskPlan build({
    required double entry,
    required bool isLong,
    double riskPercent = 0.05,
  }) {
    final stop = isLong ? entry * (1 - riskPercent) : entry * (1 + riskPercent);
    final target = isLong ? entry * (1 + riskPercent*2) : entry * (1 - riskPercent*2);
    final leverage = (1 / riskPercent).clamp(1, 20);
    return RiskPlan(entry, stop, target, leverage);
  }
}
