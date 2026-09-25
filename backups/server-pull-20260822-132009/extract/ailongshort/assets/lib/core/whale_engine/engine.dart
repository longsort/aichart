import 'models.dart';

WhaleResult analyzeWhale(WhaleInput input) {
  if (input.spoofing) {
    return WhaleResult('BLOCK', 0, '세력 유인 감지');
  }

  if (input.buyPressure > input.sellPressure && input.buyPressure > 0.6) {
    return WhaleResult('SUPPORT', 70, '고래 매수 우위');
  }

  if (input.sellPressure > input.buyPressure && input.sellPressure > 0.6) {
    return WhaleResult('PRESSURE', 70, '고래 매도 우위');
  }

  return WhaleResult('NEUTRAL', 40, '고래 영향 미미');
}
