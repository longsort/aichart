import '../core/models/fu_state.dart';
import 'analysis_result.dart';
import 'modules/evidence_matcher.dart';

class FinalSignalEngineV2 {
  static AnalysisResult run(FuState s) {
    // ?úÏÑ±?? Í±∞Îûò???àÏä§?†Î¶¨ Í∑ºÍ±∞Î•??§Ï†ú Í∞íÏúºÎ°?Ï±ÑÏ?
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

    String conclusion = "Í¥ÄÎß?;
    String strength = "WEAK";
    if (hit >= 4) {
      conclusion = (s.signalDir == 'SHORT') ? "?? : "Î°?;
      strength = "STRONG";
    } else if (hit == 3) {
      conclusion = (s.signalDir == 'SHORT') ? "?? : (s.signalDir == 'LONG' ? "Î°? : "Í¥ÄÎß?);
      strength = "MID";
    }

    return AnalysisResult(
      conclusion: conclusion,
      strength: strength,
      hit: hit,
      total: 5,
      reason: "Í∑ºÍ±∞ $hit/5 (?∏Î†•/?åÎèô/Ï°?Í±∞Îûò???àÏä§?†Î¶¨)",
    );
  }
}
