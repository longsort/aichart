import 'signal_log.dart';

/// PHASE H ???¤íŒ¨ 2?°ì†: confidence -10, ?™ì¼ì¡°ê±´ 3???¤íŒ¨: ì¿¨ë‹¤?? ?±ê³µ: score +5 (ê³¼ë„ ?ìŠ¹ ê¸ˆì?)
class SelfTuneEngine {
  static Future<int> getLossStreakStatic() => SignalLog.lossStreak();

  Future<int> getLossStreak() => SignalLog.lossStreak();

  /// ?¤íŒ¨ 2?°ì†?´ë©´ confidence ë³´ì •ê°?(?Œìˆ˜)
  int confidencePenalty(int lossStreak) {
    if (lossStreak >= 2) return -10;
    return 0;
  }

  /// ?ìš©??confidence (0~100 ?´ë¨??
  int adjustedConfidence(int baseConfidence, int lossStreak) {
    return (baseConfidence + confidencePenalty(lossStreak)).clamp(0, 100);
  }
}
