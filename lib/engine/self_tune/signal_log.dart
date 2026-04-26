import 'package:sqflite/sqflite.dart';
import '../../data/local/db.dart';

/// PHASE H ??SignalLog(SQLite): time, symbol, tf, dir, entry, sl, tp, result, evidenceScore, confidence
class SignalLog {
  static Future<Database> get _db => Db.database;

  static Future<void> add({
    required int time,
    required String symbol,
    required String tf,
    required String dir,
    required double entry,
    required double sl,
    required double tp,
    String? result,
    int? evidenceScore,
    int? confidence,
  }) async {
    final db = await _db;
    await db.insert('signal_log', {
      'time': time,
      'symbol': symbol,
      'tf': tf,
      'dir': dir,
      'entry': entry,
      'sl': sl,
      'tp': tp,
      'result': result,
      'evidence_score': evidenceScore,
      'confidence': confidence,
    });
  }

  static Future<int> lossStreak() async {
    final db = await _db;
    try {
      final rows = await db.query('signal_log', orderBy: 'time DESC', limit: 50);
      var streak = 0;
      for (final r in rows) {
        final res = r['result'] as String?;
        if (res == null) break;
        if (res == 'fail') streak++;
        else break;
      }
      return streak;
    } catch (_) {
      return 0;
    }
  }

  /// S-07: 최소 20�?로그 조회 (로그 ?�면??
  static Future<List<SignalLogEntry>> recent({int limit = 50}) async {
    try {
      final db = await _db;
      final rows = await db.query('signal_log', orderBy: 'time DESC', limit: limit);
      return rows.map((r) => SignalLogEntry(
        time: r['time'] as int,
        symbol: r['symbol'] as String,
        tf: r['tf'] as String,
        dir: r['dir'] as String,
        entry: (r['entry'] as num).toDouble(),
        sl: (r['sl'] as num).toDouble(),
        tp: (r['tp'] as num).toDouble(),
        result: r['result'] as String?,
      )).toList();
    } catch (_) {
      return [];
    }
  }
}

class SignalLogEntry {
  final int time;
  final String symbol;
  final String tf;
  final String dir;
  final double entry;
  final double sl;
  final double tp;
  final String? result;

  SignalLogEntry({
    required this.time,
    required this.symbol,
    required this.tf,
    required this.dir,
    required this.entry,
    required this.sl,
    required this.tp,
    this.result,
  });
}
