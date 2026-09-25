
import 'dart:convert';
import 'dart:io';

import 'package:path_provider/path_provider.dart';
import 'trade_log.dart';

/// Simple file-backed store (JSON lines) to keep learning/stats working
/// on both Android + Windows without extra DB deps.
class TradeStore {
  static const _fileName = 'fulink_trade_logs.jsonl';

  Future<File> _file() async {
    final dir = await getApplicationDocumentsDirectory();
    final f = File('${dir.path}/$_fileName');
    if (!await f.exists()) {
      await f.create(recursive: true);
    }
    return f;
  }

  Future<void> append(TradeLog log) async {
    final f = await _file();
    final map = {
      'symbol': log.symbol,
      'direction': log.direction,
      'entry': log.entry,
      'exit': log.exit,
      'win': log.win,
      'time': log.time.toIso8601String(),
      'meta': log.meta,
    };
    await f.writeAsString('${jsonEncode(map)}\n', mode: FileMode.append, flush: true);
  }

  Future<List<TradeLog>> readAll({int limit = 500}) async {
    final f = await _file();
    final lines = await f.readAsLines();
    final out = <TradeLog>[];
    for (final line in lines.reversed) {
      if (line.trim().isEmpty) continue;
      try {
        final m = jsonDecode(line) as Map<String, dynamic>;
        out.add(TradeLog(
          m['symbol']?.toString() ?? 'UNK',
          m['direction']?.toString() ?? 'none',
          (m['entry'] as num?)?.toDouble() ?? 0.0,
          (m['exit'] as num?)?.toDouble() ?? 0.0,
          (m['win'] as bool?) ?? false,
          DateTime.tryParse(m['time']?.toString() ?? '') ?? DateTime.now(),
          meta: (m['meta'] is Map) ? Map<String, dynamic>.from(m['meta']) : const {},
        ));
      } catch (_) {}
      if (out.length >= limit) break;
    }
    return out;
  }
}
