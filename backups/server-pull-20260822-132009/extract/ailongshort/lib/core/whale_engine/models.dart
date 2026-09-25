class WhaleInput {
  final double buyPressure;   // ë§¤ìˆ˜ ?•ë ¥ (0~1)
  final double sellPressure;  // ë§¤ë„ ?•ë ¥ (0~1)
  final bool spoofing;        // ?¤í‘¸??? ì¸ ?¬ë?
  WhaleInput(this.buyPressure, this.sellPressure, this.spoofing);
}

class WhaleResult {
  final String state; // SUPPORT / PRESSURE / NEUTRAL / BLOCK
  final int score;    // 0~100
  final String note;
  WhaleResult(this.state, this.score, this.note);
}
