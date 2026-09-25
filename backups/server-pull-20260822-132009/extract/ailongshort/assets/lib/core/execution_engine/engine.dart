import 'models.dart';

ExecutionResult calcExecution(ExecutionInput i) {
  final volSpike = i.volAvg <= 0 ? 1.0 : (i.volNow / i.volAvg);

  final sBuy = (i.buyRatio - 0.5) * 2; // -1~+1
  final sVol = ((volSpike - 1).clamp(0, 2)) / 2; // 0~1
  final sBook = ((i.bookImbalance + 1) / 2).clamp(0, 1); // 0~1

  final score = (0.45 * ((sBuy + 1) / 2) + 0.35 * sVol + 0.20 * sBook) * 100;

  final side = sBuy > 0.12 ? 'BUY' : (sBuy < -0.12 ? 'SELL' : 'NEUTRAL');
  final note = '체결 ${(i.buyRatio * 100).toStringAsFixed(0)}% / 볼륨 ${volSpike.toStringAsFixed(2)}x / 오더북 ${(i.bookImbalance * 100).toStringAsFixed(0)}';

  return ExecutionResult(score.round().clamp(0, 100), side, note);
}
