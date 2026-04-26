import 'models.dart';

class TfResult {
  final String bias;
  final int score;
  TfResult(this.bias, this.score);
}

TfResult mergeBias({
  required TfBias daily,
  required TfBias weekly,
  required TfBias monthly,
}) {
  int longScore = 0;
  int shortScore = 0;

  for (final b in [daily, weekly, monthly]) {
    if (b.bias == 'LONG') longScore += b.score;
    if (b.bias == 'SHORT') shortScore += b.score;
  }

  if (longScore == shortScore) {
    return TfResult('NEUTRAL', 0);
  }

  if (longScore > shortScore) {
    return TfResult('LONG', (longScore - shortScore).clamp(0, 100));
  } else {
    return TfResult('SHORT', (shortScore - longScore).clamp(0, 100));
  }
}
