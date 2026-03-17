import 'models.dart';

class SignalConfig {
  static const double minProfit = 0.25; // 25%
  static const double minRR = 3.0;
}

SignalResult decideSignal(SignalInput input) {
  if (input.expectedProfitPct < SignalConfig.minProfit) {
    return SignalResult('WAIT', 0, '수익 25% 미만');
  }
  if (input.rr < SignalConfig.minRR) {
    return SignalResult('WAIT', 0, 'RR 부족');
  }
  if (!input.trendAligned) {
    return SignalResult('SIGNAL', 55, '역추세 단기 신호');
  }
  return SignalResult('SIGNAL', 70, '정방향 신호');
}
