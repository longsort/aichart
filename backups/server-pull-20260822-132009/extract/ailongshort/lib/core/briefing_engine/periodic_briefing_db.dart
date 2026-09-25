import 'package:path/path.dart';
import 'package:sqflite/sqflite.dart';

class PeriodicBriefingRow {
  final String key; // ex) 1w_2026-01-19
  final String tf; // 1d/1w/1m/1y
  final int closeTsKst; // period close timestamp in KST millis
  final String title;
  final String body;
  final int notified; // 0/1

  PeriodicBriefingRow({
    required this.key,
    required this.tf,
    required this.closeTsKst,
    required this.title,
    required this.body,
    required this.notified,
  });

  Map<String, Object?> toMap() => {
        'k': key,
        'tf': tf,
        'closeTsKst': closeTsKst,
        'title': title,
        'body': body,
        'notified': notified,
      };

  static PeriodicBriefingRow fromMap(Map<String, Object?> m) {
    return PeriodicBriefingRow(
      key: (m['k'] as String?) ?? '',
      tf: (m['tf'] as String?) ?? '',
      closeTsKst: (m['closeTsKst'] as int?) ?? 0,
      title: (m['title'] as String?) ?? '',
      body: (m['body'] as String?) ?? '',
      notified: (m['notified'] as int?) ?? 0,
    );
  }
}

/// �?????�??? 브리?�을 ?�기�???1?�”로 보�??�기 ?�한 DB.
/// - ?�른 로그 DB?� 분리(버전 충돌/마이그레?�션 리스??최소??
class PeriodicBriefingDB {
  static Database? _db;

  static Future<Database> _open() async {
    if (_db != null) return _db!;
    final p = join(await getDatabasesPath(), 'fulink_briefings.db');
    _db = await openDatabase(
      p,
      version: 1,
      onCreate: (db, v) async {
        await db.execute('''
          CREATE TABLE periodic_briefings(
            k TEXT PRIMARY KEY,
            tf TEXT,
            closeTsKst INTEGER,
            title TEXT,
            body TEXT,
            notified INTEGER
          )
        ''');
        await db.execute('CREATE INDEX idx_periodic_tf ON periodic_briefings(tf)');
      },
    );
    return _db!;
  }

  static Future<PeriodicBriefingRow?> getByKey(String key) async {
    final db = await _open();
    final rows = await db.query('periodic_briefings', where: 'k=?', whereArgs: [key], limit: 1);
    if (rows.isEmpty) return null;
    return PeriodicBriefingRow.fromMap(rows.first);
  }

  static Future<PeriodicBriefingRow?> latestForTf(String tf) async {
    final db = await _open();
    final rows = await db.query(
      'periodic_briefings',
      where: 'tf=?',
      whereArgs: [tf],
      orderBy: 'closeTsKst DESC',
      limit: 1,
    );
    if (rows.isEmpty) return null;
    return PeriodicBriefingRow.fromMap(rows.first);
  }

  static Future<void> upsert(PeriodicBriefingRow row) async {
    final db = await _open();
    await db.insert('periodic_briefings', row.toMap(), conflictAlgorithm: ConflictAlgorithm.replace);
  }

  static Future<void> markNotified(String key) async {
    final db = await _open();
    await db.update('periodic_briefings', {'notified': 1}, where: 'k=?', whereArgs: [key]);
  }
}
