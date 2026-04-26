class WhaleInput {
  final double buyPressure;   // 매수 압력 (0~1)
  final double sellPressure;  // 매도 압력 (0~1)
  final bool spoofing;        // 스푸핑/유인 여부
  WhaleInput(this.buyPressure, this.sellPressure, this.spoofing);
}

class WhaleResult {
  final String state; // SUPPORT / PRESSURE / NEUTRAL / BLOCK
  final int score;    // 0~100
  final String note;
  WhaleResult(this.state, this.score, this.note);
}
