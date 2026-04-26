class SignalInput {
  final double expectedProfitPct; // ?ˆìƒ ?˜ìµë¥?(?? 0.22 = 22%)
  final double rr;                // RR ë¹„ìœ¨
  final bool trendAligned;        // ?•ë°©???¬ë?
  SignalInput(this.expectedProfitPct, this.rr, this.trendAligned);
}

class SignalResult {
  final String state; // SIGNAL / WAIT / BLOCK
  final int strength; // 0~100
  final String note;
  SignalResult(this.state, this.strength, this.note);
}
