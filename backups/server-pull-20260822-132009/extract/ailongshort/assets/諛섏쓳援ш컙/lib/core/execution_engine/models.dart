class ExecutionInput {
  final double buyRatio;      // 0~1
  final double volNow;
  final double volAvg;
  final double bookImbalance; // -1~+1 (매수 두꺼우면 +)

  ExecutionInput({
    required this.buyRatio,
    required this.volNow,
    required this.volAvg,
    required this.bookImbalance,
  });
}

class ExecutionResult {
  final int score; // 0~100
  final String side; // BUY/SELL/NEUTRAL
  final String note;
  ExecutionResult(this.score, this.side, this.note);
}
