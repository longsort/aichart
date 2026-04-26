
import 'dart:convert';
import 'dart:io';

/// ✅ 룰 기반 자가보정(안전형)
/// - 신호 기록(JSONL)
/// - 결과(성공/실패/무효) 기록
/// - 최근 성과로 "보수성(페널티)" 자동 조정
///
/// ⚠️ 외부 패키지 없이 동작 (path_provider 불필요)
class LearningEngine {
  static const String _logFileName = 'fulink_logs.jsonl';

  /// 로그 파일 경로(프로젝트/앱 실행 디렉토리 기준)
  static File get _logFile => File(_logFileName);

  /// 신호 기록 (예측)
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

  /// 결과 기록 (채점)
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

  /// 최근 로그를 읽어 성과 계산
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

  /// ✅ 자가보정 페널티
  /// - 최근 손실이 많을수록, 확신도를 깎고 "쉬기"로 유도
  /// - 안전형(오버피팅/폭주 방지)
  static Future<int> conservatismPenalty({int window = 120}) async {
    final s = await recentStats(maxLines: window);
    final total = s.win + s.loss + s.timeout;
    if (total < 10) return 0; // 표본 부족이면 보정 X
    final winRate = s.win / total;
    // 승률 낮을수록 페널티 증가(0~25)
    final p = ((0.65 - winRate) * 60).round(); // 65% 기준
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
