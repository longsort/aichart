class SignalInput {
  final double expectedProfitPct; // 예상 수익률 (예: 0.22 = 22%)
  final double rr;                // RR 비율
  final bool trendAligned;        // 정방향 여부
  SignalInput(this.expectedProfitPct, this.rr, this.trendAligned);
}

class SignalResult {
  final String state; // SIGNAL / WAIT / BLOCK
  final int strength; // 0~100
  final String note;
  SignalResult(this.state, this.strength, this.note);
}
