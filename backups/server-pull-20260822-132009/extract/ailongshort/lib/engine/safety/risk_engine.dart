/// PHASE F ???ˆìš©?ì‹¤ = equity * 0.05, ?˜ëŸ‰ = ?ˆìš©?ì‹¤ / abs(entry - sl)
class RiskEngine {
  /// positionSize (?˜ëŸ‰), sl ?†ê±°??ê±°ë¦¬ 0?´ë©´ 0
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
