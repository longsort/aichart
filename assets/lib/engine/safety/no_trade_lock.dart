import '../models/engine_output.dart';

/// PHASE G — confidence < 40 또는 연속 실패 >= 2 시 매매 금지
class NoTradeLock {
  /// isLocked, reason
  ({bool isLocked, String reason}) check(EngineOutput output, {int lossStreak = 0}) {
    if (output.confidence < 40) {
      return (isLocked: true, reason: '신뢰도 낮음 (${output.confidence}%)');
    }
    if (lossStreak >= 2) {
      return (isLocked: true, reason: '연속 실패 $lossStreak회');
    }
    return (isLocked: false, reason: '');
  }
}
