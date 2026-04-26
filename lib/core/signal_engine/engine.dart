import 'models.dart';

class SignalConfig {
  static const double minProfit = 0.25; // 25%
  static const double minRR = 3.0;
}

SignalResult decideSignal(SignalInput input) {
  if (input.expectedProfitPct < SignalConfig.minProfit) {
    return SignalResult('WAIT', 0, '?˜ìµ 25% ë¯¸ë§Œ');
  }
  if (input.rr < SignalConfig.minRR) {
    return SignalResult('WAIT', 0, 'RR ë¶€ì¡?);
  }
  if (!input.trendAligned) {
    return SignalResult('SIGNAL', 55, '??¶”???¨ê¸° ? í˜¸');
  }
  return SignalResult('SIGNAL', 70, '?•ë°©??? í˜¸');
}
