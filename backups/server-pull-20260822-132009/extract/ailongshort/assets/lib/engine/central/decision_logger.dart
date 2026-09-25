import 'dart:convert';
import 'dart:io';

/// Ultra-safe local logger (no extra deps).
/// Writes JSONL to ./fulink_logs/central_decisions.jsonl
///
/// - Never throws (errors are swallowed)
/// - Throttled (default: 5 seconds)
class DecisionLogger {
  static final DecisionLogger I = DecisionLogger._();
  DecisionLogger._();

  DateTime _last = DateTime.fromMillisecondsSinceEpoch(0);
  final Duration throttle = const Duration(seconds: 5);

  void log({required double consensus01, required Map<String, int> tfUp}) {
    try {
      final now = DateTime.now();
      if (now.difference(_last) < throttle) return;
      _last = now;

      final dir = Directory('fulink_logs');
      if (!dir.existsSync()) dir.createSync(recursive: true);

      final f = File('fulink_logs/central_decisions.jsonl');
      final m = <String, dynamic>{
        'ts': now.toIso8601String(),
        'consensus01': double.parse(consensus01.toStringAsFixed(4)),
        'tfUp': tfUp,
      };
      f.writeAsStringSync('${jsonEncode(m)}\n', mode: FileMode.append, flush: false);
    } catch (_) {
      // swallow
    }
  }
}
