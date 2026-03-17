/// PHASE F — 허용손실 = equity * 0.05, 수량 = 허용손실 / abs(entry - sl)
class RiskEngine {
  /// positionSize (수량), sl 없거나 거리 0이면 0
  double positionSize(double equity, double entry, double sl) {
    final allowedLoss = equity * 0.05;
    final distance = (entry - sl).abs();
    if (distance <= 0) return 0;
    return allowedLoss / distance;
  }

  bool isValidScenario(double entry, double? sl) {
    if (sl == null) return false;
    if ((entry - sl).abs() <= 0) return false;
    return true;
  }
}
