import '../core/models/fu_state.dart';
import 'analysis_result.dart';
import 'modules/evidence_matcher.dart';

class FinalSignalEngineV2 {
  static AnalysisResult run(FuState s) {
    // 활성화: 거래량/히스토리 근거를 실제 값으로 채움
    final tyron = s.forceScore >= 55 || s.whaleScore >= 55;
    final wave = (s.longScore - s.shortScore).abs() >= 8;
    final zone = s.zoneCode.isNotEmpty && s.zoneCode != 'NONE';
    final volume = s.volumeScore >= 55;
    final history = s.signalProb >= 55 || s.confidenceScore >= 60;

    final hit = EvidenceMatcher.matchCount(
      tyron: tyron,
      wave: wave,
      zone: zone,
      volume: volume,
      history: history,
    );

    String conclusion = "관망";
    String strength = "WEAK";
    if (hit >= 4) {
      conclusion = (s.signalDir == 'SHORT') ? "숏" : "롱";
      strength = "STRONG";
    } else if (hit == 3) {
      conclusion = (s.signalDir == 'SHORT') ? "숏" : (s.signalDir == 'LONG' ? "롱" : "관망");
      strength = "MID";
    }

    return AnalysisResult(
      conclusion: conclusion,
      strength: strength,
      hit: hit,
      total: 5,
      reason: "근거 $hit/5 (세력/파동/존/거래량/히스토리)",
    );
  }
}
