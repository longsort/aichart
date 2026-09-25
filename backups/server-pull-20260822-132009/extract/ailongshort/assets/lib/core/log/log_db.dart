import 'package:path/path.dart';
import 'package:sqflite/sqflite.dart';
import 'signal_log.dart';

class LogDB {
  static Database? _db;

  static Future<Database> _open() async {
    if (_db != null) return _db!;
    final p = join(await getDatabasesPath(), 'fulink_logs.db');
    _db = await openDatabase(
      p,
      version: 1,
      onCreate: (db, v) async {
        await db.execute('''
          CREATE TABLE signal_logs(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ts INTEGER,
            symbol TEXT,
            tf TEXT,
            dir TEXT,
            prob INTEGER,
            evidenceHit INTEGER,
            evidenceTotal INTEGER,
            score INTEGER,
            confidence INTEGER,
            risk INTEGER,
            entry REAL,
            sl REAL,
            tp REAL,
            qty REAL,
            leverage REAL,
            status TEXT,
            result TEXT,
            exitPrice REAL,
            closedTs INTEGER
          )
        ''');
      },
    );
    return _db!;
  }

  static Future<int> insertOpen(SignalLog s) async {
    final db = await _open();
    return db.insert('signal_logs', s.toMap(includeId: false));
  }

  static Future<void> closeLog({
    required int id,
    required String result,
    required double exitPrice,
  }) async {
    final db = await _open();
    await db.update(
      'signal_logs',
      {
        'status': 'CLOSED',
        'result': result,
        'exitPrice': exitPrice,
        'closedTs': DateTime.now().millisecondsSinceEpoch,
      },
      where: 'id=?',
      whereArgs: [id],
    );
  }

  static Future<List<SignalLog>> recent({int limit = 500}) async {
    final db = await _open();
    final rows = await db.query('signal_logs', orderBy: 'ts DESC', limit: limit);
    return rows.map((m) => SignalLog.fromMap(m)).toList();
  }

  static Future<Map<String, int>> stats({int limit = 500}) async {
    final list = await recent(limit: limit);
    int win = 0, loss = 0, open = 0;
    for (final x in list) {
      if (x.status == 'OPEN') open++;
      if (x.result == 'WIN') win++;
      if (x.result == 'LOSS') loss++;
    }
    final total = win + loss;
    final winRate = total == 0 ? 0 : ((win / total) * 100).round();
    return {'win': win, 'loss': loss, 'open': open, 'total': total, 'winRate': winRate};
  }
}
