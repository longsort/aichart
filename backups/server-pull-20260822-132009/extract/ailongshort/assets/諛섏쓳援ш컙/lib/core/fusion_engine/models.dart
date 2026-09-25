class FusionInput {
  final String spineState; // LONG / SHORT / WAIT
  final int tfScore;       // 0~100
  final double riskPct;    // 적용 리스크
  final String signalState;// SIGNAL / WAIT
  final String whaleState; // SUPPORT / PRESSURE / NEUTRAL / BLOCK

  FusionInput({
    required this.spineState,
    required this.tfScore,
    required this.riskPct,
    required this.signalState,
    required this.whaleState,
  });
}

class FusionResult {
  final String finalState; // LONG / SHORT / WAIT / BLOCK
  final int probability;  // 0~100
  final String note;

  FusionResult(this.finalState, this.probability, this.note);
}
