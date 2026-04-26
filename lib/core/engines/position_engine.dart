class PositionResult {
  final double qty;
  final double riskAmount;
  final double riskPct;
  final int leverage;
  const PositionResult({
    required this.qty,
    required this.riskAmount,
    required this.riskPct,
    required this.leverage,
  });
}

class PositionEngine {
  // ?�물: ?�절 거리 기반 ?�량 계산 (?�순 버전)
  static PositionResult calc({
    required double balance,
    required double entry,
    required double stop,
    double riskPct = 5,
    int leverage = 5,
  }) {
    final riskAmount = balance * (riskPct / 100.0);
    final dist = (entry - stop).abs();
    final qty = dist > 0 ? (riskAmount / dist) * leverage : 0.0;
    return PositionResult(qty: qty, riskAmount: riskAmount, riskPct: riskPct, leverage: leverage);
  }
}
