import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';
import 'package:sqflite/sqflite.dart';

class TradeLogDb {
  TradeLogDb._();
  static final TradeLogDb I = TradeLogDb._();

  Database? _db;

  Future<Database> _open() async {
    if (_db != null) return _db!;
    final dir = await getApplicationDocumentsDirectory();
    final path = p.join(dir.path, 'fulink_trade_log.db');
    final db = await openDatabase(
      path,
      version: 1,
      onCreate: (d, v) async {
        await d.execute('''
          CREATE TABLE IF NOT EXISTS logs(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ts INTEGER,
            symbol TEXT,
            tf TEXT,
            state TEXT,
            entry REAL,
            stop REAL,
            target REAL,
            result TEXT
          );
        ''');
      },
    );
    _db = db;
    return db;
  }

  Future<void> add({
    required int ts,
    required String symbol,
    required String tf,
    required String state,
    required double entry,
    required double stop,
    required double target,
    String result = '',
  }) async {
    final db = await _open();
    await db.insert('logs', {
      'ts': ts,
      'symbol': symbol,
      'tf': tf,
      'state': state,
      'entry': entry,
      'stop': stop,
      'target': target,
      'result': result,
    });
  }
}
