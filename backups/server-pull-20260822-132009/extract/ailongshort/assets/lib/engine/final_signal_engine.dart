
import 'analysis_result.dart';
import 'modules/evidence_matcher.dart';

class FinalSignalEngine {
  static AnalysisResult run() {
    // TODO: 실제 데이터 연결 시 true/false 교체
    final hit = EvidenceMatcher.matchCount(
      tyron: true,
      wave: true,
      zone: true,
      volume: false,
      history: false,
    );

    String conclusion = "관망";
    String strength = "WEAK";

    if (hit >= 4) {
      conclusion = "숏";
      strength = "STRONG";
    } else if (hit == 3) {
      conclusion = "롱";
      strength = "MID";
    }

    return AnalysisResult(
      conclusion: conclusion,
      strength: strength,
      hit: hit,
      total: 5,
      reason: "근거 $hit/5 일치",
    );
  }
}
