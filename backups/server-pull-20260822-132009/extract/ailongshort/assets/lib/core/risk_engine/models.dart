class RiskInput {
  final double balance;
  final double stopPct; // 손절폭 (예: 0.012 = 1.2%)
  final bool counterTrend; // 역추세 여부
  RiskInput(this.balance, this.stopPct, this.counterTrend);
}

class RiskResult {
  final double riskPct;     // 적용 리스크 비율
  final double leverage;    // 권장 레버리지
  final String note;        // 설명
  RiskResult(this.riskPct, this.leverage, this.note);
}
