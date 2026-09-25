class RiskInput {
  final double balance;
  final double stopPct; // ?ì ˆ??(?? 0.012 = 1.2%)
  final bool counterTrend; // ??¶”???¬ë?
  RiskInput(this.balance, this.stopPct, this.counterTrend);
}

class RiskResult {
  final double riskPct;     // ?ìš© ë¦¬ìŠ¤??ë¹„ìœ¨
  final double leverage;    // ê¶Œì¥ ?ˆë²„ë¦¬ì?
  final String note;        // ?¤ëª…
  RiskResult(this.riskPct, this.leverage, this.note);
}
