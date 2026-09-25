class PnlCalc {
  // R-based pnl with fee/slippage
  static double calcR({
    required String dir,
    required double entry,
    required double exit,
    required double stop,
    double feeBps = 6.0,      // 0.06% default
    double slipBps = 5.0,     // 0.05% default
  }) {
    final risk = (entry - stop).abs();
    if (risk <= 1e-9) return 0.0;

    double raw;
    if (dir == 'LONG') {
      raw = (exit - entry) / risk;
    } else {
      raw = (entry - exit) / risk;
    }

    // apply costs in R units approximately (cost as % of entry scaled by risk)
    final costPct = (feeBps + slipBps) / 10000.0;
    final cost = (entry.abs() * costPct) / risk;
    return raw - cost;
  }
}
