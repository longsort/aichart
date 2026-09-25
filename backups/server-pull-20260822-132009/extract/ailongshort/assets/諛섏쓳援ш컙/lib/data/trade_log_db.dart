import 'package:sqflite/sqflite.dart';
import 'package:path/path.dart' as p;

/// TradeLog DB helper for Fulink Pro
/// - Ensures table exists
/// - Inserts logs (optional)
/// - Fetches rolling hit-rate for AI confidence
class TradeLogDb {
  static const _dbName = 'fulink_trade_logs.db';
  static const _dbVersion = 1;

  static Database? _db;

  static Future<Database> db() async {
    if (_db != null) return _db!;
    final dir = await getDatabasesPath();
    final path = p.join(dir, _dbName);

    _db = await openDatabase(
      path,
      version: _dbVersion,
      onCreate: (d, v) async {
        await _create(d);
      },
      onOpen: (d) async {
        await _create(d); // safety for older installs
      },
    );
    return _db!;
  }

  static Future<void> _create(Database d) async {
    await d.execute('''
CREATE TABLE IF NOT EXISTS trade_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol TEXT,
  tf TEXT,
  direction TEXT,
  entry REAL,
  sl REAL,
  tp REAL,
  rr REAL,
  evidence_score REAL,
  regime TEXT,
  mae REAL,
  mfe REAL,
  result TEXT,          -- 'TP' | 'SL' | 'TIMEOUT' | 'BE' | 'CANCEL'
  created_at INTEGER    -- unix ms
);
''');
    await d.execute('CREATE INDEX IF NOT EXISTS idx_trade_logs_created_at ON trade_logs(created_at DESC);');
    await d.execute('CREATE INDEX IF NOT EXISTS idx_trade_logs_symbol_tf ON trade_logs(symbol, tf);');
  }

  /// Rolling hit rate in percent (0~100).
  /// hitResult: default 'TP'
  /// includeResults: which rows count as "valid samples"
  static Future<double> rollingHitRatePct({
    String? symbol,
    String? tf,
    int lastN = 20,
    String hitResult = 'TP',
    List<String> includeResults = const ['TP', 'SL', 'TIMEOUT', 'BE'],
  }) async {
    final d = await db();

    final where = <String>[];
    final args = <Object?>[];

    if (symbol != null && symbol.isNotEmpty) {
      where.add('symbol = ?');
      args.add(symbol);
    }
    if (tf != null && tf.isNotEmpty) {
      where.add('tf = ?');
      args.add(tf);
    }
    where.add('result IN (${List.filled(includeResults.length, '?').join(',')})');
    args.addAll(includeResults);

    final whereSql = where.isEmpty ? '' : 'WHERE ' + where.join(' AND ');

    final rows = await d.rawQuery('''
SELECT result
FROM trade_logs
$whereSql
ORDER BY created_at DESC
LIMIT ?
''', [...args, lastN]);

    if (rows.isEmpty) return 50.0; // neutral default

    int win = 0;
    int total = 0;
    for (final r in rows) {
      final res = (r['result'] as String?)?.toUpperCase() ?? '';
      total += 1;
      if (res == hitResult) win += 1;
    }
    return (win / total) * 100.0;
  }
}