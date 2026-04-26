import 'signal_log.dart';

/// PHASE H — 실패 2연속: confidence -10, 동일조건 3회 실패: 쿨다운, 성공: score +5 (과도 상승 금지)
class SelfTuneEngine {
  static Future<int> getLossStreakStatic() => SignalLog.lossStreak();

  Future<int> getLossStreak() => SignalLog.lossStreak();

  /// 실패 2연속이면 confidence 보정값 (음수)
  int confidencePenalty(int lossStreak) {
    if (lossStreak >= 2) return -10;
    return 0;
  }

  /// 적용된 confidence (0~100 클램프)
  int adjustedConfidence(int baseConfidence, int lossStreak) {
    return (baseConfidence + confidencePenalty(lossStreak)).clamp(0, 100);
  }
}
