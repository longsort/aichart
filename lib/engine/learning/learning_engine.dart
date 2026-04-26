
import 'dart:convert';
import 'dart:io';

/// ??Î£?Í∏∞Î∞ò ?êÍ?Î≥¥Ï†ï(?àÏ†Ñ??
/// - ?†Ìò∏ Í∏∞Î°ù(JSONL)
/// - Í≤∞Í≥º(?±Í≥µ/?§Ìå®/Î¨¥Ìö®) Í∏∞Î°ù
/// - ÏµúÍ∑º ?±Í≥ºÎ°?"Î≥¥Ïàò???òÎÑê??" ?êÎèô Ï°∞Ï†ï
///
/// ?†Ô∏è ?∏Î? ?®ÌÇ§ÏßÄ ?ÜÏù¥ ?ôÏûë (path_provider Î∂àÌïÑ??
class LearningEngine {
  static const String _logFileName = 'fulink_logs.jsonl';

  /// Î°úÍ∑∏ ?åÏùº Í≤ΩÎ°ú(?ÑÎ°ú?ùÌä∏/???§Ìñâ ?îÎ†â?†Î¶¨ Í∏∞Ï?)
  static File get _logFile => File(_logFileName);

  /// ?†Ìò∏ Í∏∞Î°ù (?àÏ∏°)
  static Future<void> recordSignal({
    required String symbol,
    required String tf,
    required String conclusion, // "long" / "short" / "wait"
    required int confidence,
    required int evidenceCount,
    required int evidenceTotal,
    double? entry,
    double? stop,
    double? target,
  }) async {
    final m = <String, dynamic>{
      "type": "signal",
      "ts": DateTime.now().toIso8601String(),
      "symbol": symbol,
      "tf": tf,
      "conclusion": conclusion,
      "confidence": confidence,
      "evidence": {"hit": evidenceCount, "total": evidenceTotal},
      "plan": {"entry": entry, "stop": stop, "target": target},
    };
    await _append(m);
  }

  /// Í≤∞Í≥º Í∏∞Î°ù (Ï±ÑÏ†ê)
  /// outcome: "win" / "loss" / "timeout"
  static Future<void> recordOutcome({
    required String symbol,
    required String tf,
    required String outcome,
    String? note,
  }) async {
    final m = <String, dynamic>{
      "type": "outcome",
      "ts": DateTime.now().toIso8601String(),
      "symbol": symbol,
      "tf": tf,
      "outcome": outcome,
      "note": note,
    };
    await _append(m);
  }

  /// ÏµúÍ∑º Î°úÍ∑∏Î•??ΩÏñ¥ ?±Í≥º Í≥ÑÏÇ∞
  static Future<Stats> recentStats({int maxLines = 200}) async {
    if (!await _logFile.exists()) return Stats.empty();
    final lines = await _logFile.readAsLines();
    final take = lines.length > maxLines ? lines.sublist(lines.length - maxLines) : lines;
    int win = 0, loss = 0, timeout = 0;
    for (final ln in take) {
      if (ln.trim().isEmpty) continue;
      try {
        final m = jsonDecode(ln);
        if (m is Map && m["type"] == "outcome") {
          final o = (m["outcome"] ?? "").toString();
          if (o == "win") win++;
          else if (o == "loss") loss++;
          else if (o == "timeout") timeout++;
        }
      } catch (_) {}
    }
    return Stats(win: win, loss: loss, timeout: timeout);
  }

  /// ???êÍ?Î≥¥Ï†ï ?òÎÑê??  /// - ÏµúÍ∑º ?êÏã§??ÎßéÏùÑ?òÎ°ù, ?ïÏã†?ÑÎ? ÍπéÍ≥† "?¨Í∏∞"Î°??†ÎèÑ
  /// - ?àÏ†Ñ???§Î≤Ñ?ºÌåÖ/??£º Î∞©Ï?)
  static Future<int> conservatismPenalty({int window = 120}) async {
    final s = await recentStats(maxLines: window);
    final total = s.win + s.loss + s.timeout;
    if (total < 10) return 0; // ?úÎ≥∏ Î∂ÄÏ°±Ïù¥Î©?Î≥¥Ï†ï X
    final winRate = s.win / total;
    // ?πÎ•† ??ùÑ?òÎ°ù ?òÎÑê??Ï¶ùÍ?(0~25)
    final p = ((0.65 - winRate) * 60).round(); // 65% Í∏∞Ï?
    if (p <= 0) return 0;
    if (p > 25) return 25;
    return p;
  }

  static Future<void> _append(Map<String, dynamic> m) async {
    try {
      final line = jsonEncode(m);
      await _logFile.writeAsString('$line\n', mode: FileMode.append, flush: true);
    } catch (_) {}
  }
}

/// Public stats model for UI + engines.
class Stats {
  final int win;
  final int loss;
  final int timeout;
  Stats({required this.win, required this.loss, required this.timeout});
  factory Stats.empty() => Stats(win: 0, loss: 0, timeout: 0);

  int get total => win + loss + timeout;
  int get winRatePct => total == 0 ? 0 : ((win / total) * 100).round();
}
