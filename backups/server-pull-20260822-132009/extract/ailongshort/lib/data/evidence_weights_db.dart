import 'package:sqflite/sqflite.dart';
import 'package:path/path.dart' as p;

/// Evidence Weights DB
/// Stores per-evidence weights and global thresholds that auto-tune over time.
class EvidenceWeightsDb {
  static const _dbName = 'fulink_evidence_weights.db';
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
        await _create(d);
      },
    );
    return _db!;
  }

  static Future<void> _create(Database d) async {
    await d.execute('''
CREATE TABLE IF NOT EXISTS evidence_weights (
  key TEXT PRIMARY KEY,
  w REAL NOT NULL,
  updated_at INTEGER NOT NULL
);
''');
    await d.execute('''
CREATE TABLE IF NOT EXISTS tune_state (
  id INTEGER PRIMARY KEY CHECK (id=1),
  threshold REAL NOT NULL,
  lr REAL NOT NULL,
  baseline REAL NOT NULL,
  updated_at INTEGER NOT NULL
);
''');
    await d.execute('''
CREATE TABLE IF NOT EXISTS tune_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at INTEGER NOT NULL,
  symbol TEXT,
  tf TEXT,
  result TEXT,
  reward REAL,
  delta_threshold REAL,
  note TEXT
);
''');
    await d.execute('CREATE INDEX IF NOT EXISTS idx_tune_logs_created_at ON tune_logs(created_at DESC);');

    // init default state if missing
    final rows = await d.query('tune_state', where: 'id=1', limit: 1);
    if (rows.isEmpty) {
      await d.insert('tune_state', {
        'id': 1,
        'threshold': 70.0, // default evidence score threshold
        'lr': 0.06,        // learning rate
        'baseline': 0.0,
        'updated_at': DateTime.now().millisecondsSinceEpoch,
      });
    }
  }

  static Future<Map<String, double>> loadWeights() async {
    final d = await db();
    final rows = await d.query('evidence_weights');
    final m = <String, double>{};
    for (final r in rows) {
      final k = r['key'] as String;
      final w = (r['w'] as num).toDouble();
      m[k] = w;
    }
    return m;
  }

  static Future<void> upsertWeight(String key, double w) async {
    final d = await db();
    await d.insert(
      'evidence_weights',
      {
        'key': key,
        'w': w,
        'updated_at': DateTime.now().millisecondsSinceEpoch,
      },
      conflictAlgorithm: ConflictAlgorithm.replace,
    );
  }

  static Future<Map<String, double>> loadState() async {
    final d = await db();
    final rows = await d.query('tune_state', where: 'id=1', limit: 1);
    if (rows.isEmpty) {
      return {'threshold': 70.0, 'lr': 0.06, 'baseline': 0.0};
    }
    final r = rows.first;
    return {
      'threshold': (r['threshold'] as num).toDouble(),
      'lr': (r['lr'] as num).toDouble(),
      'baseline': (r['baseline'] as num).toDouble(),
    };
  }

  static Future<void> saveState({
    required double threshold,
    required double lr,
    required double baseline,
  }) async {
    final d = await db();
    await d.update(
      'tune_state',
      {
        'threshold': threshold,
        'lr': lr,
        'baseline': baseline,
        'updated_at': DateTime.now().millisecondsSinceEpoch,
      },
      where: 'id=1',
      whereArgs: [1],
    );
  }

  static Future<void> insertTuneLog({
    required String symbol,
    required String tf,
    required String result,
    required double reward,
    required double deltaThreshold,
    required String note,
  }) async {
    final d = await db();
    await d.insert('tune_logs', {
      'created_at': DateTime.now().millisecondsSinceEpoch,
      'symbol': symbol,
      'tf': tf,
      'result': result,
      'reward': reward,
      'delta_threshold': deltaThreshold,
      'note': note,
    });
  }

  static Future<List<Map<String, Object?>>> recentLogs({int limit = 20}) async {
    final d = await db();
    return d.query('tune_logs', orderBy: 'created_at DESC', limit: limit);
  }
}