import '../models/engine_output.dart';

/// PHASE G ??confidence < 40 ?êÎäî ?∞ÏÜç ?§Ìå® >= 2 ??Îß§Îß§ Í∏àÏ?
class NoTradeLock {
  /// isLocked, reason
  ({bool isLocked, String reason}) check(EngineOutput output, {int lossStreak = 0}) {
    if (output.confidence < 40) {
      return (isLocked: true, reason: '?†Î¢∞????ùå (${output.confidence}%)');
    }
    if (lossStreak >= 2) {
      return (isLocked: true, reason: '?∞ÏÜç ?§Ìå® $lossStreak??);
    }
    return (isLocked: false, reason: '');
  }
}
