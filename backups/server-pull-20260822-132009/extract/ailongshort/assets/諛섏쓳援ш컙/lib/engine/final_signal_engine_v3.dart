
import 'analysis_result.dart';
import 'learning/learning_engine.dart';
import 'modules/evidence_matcher.dart';
import 'modules/no_trade_lock.dart';

/// ✅ V3: 스윙 중심 결론 + 근거 일치 + 자기보정(페널티)
/// UI는 이 결과만 읽으면 됨. (UI 수정 최소)
class FinalSignalEngineV3 {
  static Future<AnalysisResult> run({
    required bool swingMode,
    required bool eTyron,
    required bool eWave,
    required bool eZone,
    required bool eCloseConfirm,
    required bool eHistory,
    double? close4h,
    double? close1d,
    double? close1w,
    double? close1m,
    bool volatilityHigh = false,
  }) async {
    final hit = EvidenceMatcher.matchCount(
      tyron: eTyron,
      wave: eWave,
      zone: eZone,
      closeConfirm: eCloseConfirm,
      history: eHistory,
    );
    const total = 5;

    final penalty = await LearningEngine.conservatismPenalty(window: 160);
    int confidence = (55 + hit * 10 - penalty).clamp(0, 100);

    final locked = NoTradeLock.shouldLock(
      evidenceHit: hit,
      penalty: penalty,
      volatilityHigh: volatilityHigh,
    );

    String conclusion = "관망";
    String strength = "WEAK";

    if (locked) {
      conclusion = "노트레이드";
      strength = "WEAK";
      confidence = confidence.clamp(0, 65);
    } else {
      // 스윙이면 더 보수적으로: 4/5 이상에서만 신호
      final need = swingMode ? 4 : 3;
      if (hit >= need) {
        // 방향은 외부에서(타이롱/파동/구간) 실제로 정해 넣는 구조가 최선.
        // 지금은 합의가 충분하면 "롱/숏" 중 하나를 택하도록 자리만 잡음.
        conclusion = (eWave && eZone) ? "숏" : "롱";
        strength = hit >= 4 ? "STRONG" : "MID";
      }
    }

    final mode = swingMode ? "스윙" : "단타";
    final reason = "근거 $hit/$total 일치 · 보정 -$penalty";

    return AnalysisResult(
      mode: mode,
      conclusion: conclusion,
      strength: strength,
      hit: hit,
      total: total,
      confidence: confidence,
      reason: reason,
      close4h: close4h,
      close1d: close1d,
      close1w: close1w,
      close1m: close1m,
    );
  }
}
