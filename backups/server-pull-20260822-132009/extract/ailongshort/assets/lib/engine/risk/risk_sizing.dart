class RiskSizing {
  /// 5% fixed risk model.
  /// balance: account balance (USDT)
  /// entry/sl: price levels
  /// leverageCap: max leverage you want to allow
  static Map<String, dynamic> size({
    required double balance,
    required double entry,
    required double sl,
    int leverageCap = 25,
    double riskPct = 0.05,
  }) {
    final riskAmount = balance * riskPct;
    final dist = (entry - sl).abs();
    if (dist <= 0) {
      return {
        'riskAmount': riskAmount,
        'qty': 0.0,
        'leverage': 1,
        'rr': 0.0,
      };
    }

    // qty (base asset) = riskAmount / dist
    final qty = riskAmount / dist;

    // naive leverage estimate: position value / balance
    final posValue = qty * entry;
    final lev = (posValue / balance).ceil().clamp(1, leverageCap);

    return {
      'riskAmount': riskAmount,
      'qty': qty,
      'leverage': lev,
    };
  }
}