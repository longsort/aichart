// Super AGI v6 Adapter Core (Position Sizing / Dynamic Leverage)
// User inputs seed only. Risk% fixed (default 5%).
// SL distance determines qty + leverage automatically.

class PositionSizingResult {
  final double seed;
  final double riskPct;
  final double riskMoney;
  final double entry;
  final double sl;
  final double stopDist;
  final double qty;       // position size in "coin units"
  final double notional;  // qty * entry
  final double leverage;  // notional / seed

  const PositionSizingResult({
    required this.seed,
    required this.riskPct,
    required this.riskMoney,
    required this.entry,
    required this.sl,
    required this.stopDist,
    required this.qty,
    required this.notional,
    required this.leverage,
  });
}

class PositionSizerV6 {
  static PositionSizingResult compute({
    required double seed,
    double riskPct = 0.05,
    required double entry,
    required double sl,
  }) {
    final riskMoney = seed * riskPct;
    final stopDist = (entry - sl).abs();
    if (seed <= 0 || riskPct <= 0 || stopDist <= 0) {
      return PositionSizingResult(
        seed: seed,
        riskPct: riskPct,
        riskMoney: riskMoney,
        entry: entry,
        sl: sl,
        stopDist: stopDist,
        qty: 0.0,
        notional: 0.0,
        leverage: 0.0,
      );
    }
    final qty = riskMoney / stopDist;
    final notional = qty * entry;
    final leverage = notional / seed;
    return PositionSizingResult(
      seed: seed,
      riskPct: riskPct,
      riskMoney: riskMoney,
      entry: entry,
      sl: sl,
      stopDist: stopDist,
      qty: qty,
      notional: notional,
      leverage: leverage,
    );
  }
}
