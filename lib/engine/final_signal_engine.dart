
import 'analysis_result.dart';
import 'modules/evidence_matcher.dart';

class FinalSignalEngine {
  static AnalysisResult run() {
    // TODO: ?¤ì œ ?°ì´???°ê²° ??true/false êµì²´
    final hit = EvidenceMatcher.matchCount(
      tyron: true,
      wave: true,
      zone: true,
      volume: false,
      history: false,
    );

    String conclusion = "ê´€ë§?;
    String strength = "WEAK";

    if (hit >= 4) {
      conclusion = "??;
      strength = "STRONG";
    } else if (hit == 3) {
      conclusion = "ë¡?;
      strength = "MID";
    }

    return AnalysisResult(
      conclusion: conclusion,
      strength: strength,
      hit: hit,
      total: 5,
      reason: "ê·¼ê±° $hit/5 ?¼ì¹˜",
    );
  }
}
