import 'dart:async';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';
import 'package:sqflite/sqflite.dart';

class AppDb {
  AppDb._();
  static final AppDb I = AppDb._();
  Database? _db;

  Future<Database> get db async {
    if (_db != null) return _db!;
    final dir = await getApplicationDocumentsDirectory();
    final path = p.join(dir.path, 'fulink_pro.db');
    _db = await openDatabase(
      path,
      version: 2,
      onCreate: (db, v) async => _createAll(db),
      onUpgrade: (db, oldV, newV) async {
        // idempotent create
        await _createAll(db);
      },
    );
    return _db!;
  }

  Future<void> _createAll(Database db) async {
    await db.execute('''
CREATE TABLE IF NOT EXISTS signals(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,
  symbol TEXT NOT NULL,
  tf TEXT NOT NULL,
  dir TEXT NOT NULL,
  confidence INTEGER NOT NULL,
  entry REAL NOT NULL,
  sl REAL NOT NULL,
  tp REAL NOT NULL,
  rr REAL NOT NULL,
  leverage REAL NOT NULL,
  status TEXT DEFAULT 'OPEN',
  expire_ts INTEGER DEFAULT 0,
  sup_low REAL,
  sup_high REAL,
  sup_prob INTEGER,
  res_low REAL,
  res_high REAL,
  res_prob INTEGER,
  reason TEXT
);
''');

    await db.execute('''
CREATE TABLE IF NOT EXISTS outcomes(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  signal_id INTEGER NOT NULL,
  ts_close INTEGER NOT NULL,
  result TEXT NOT NULL,
  pnl REAL NOT NULL,
  method TEXT NOT NULL,
  FOREIGN KEY(signal_id) REFERENCES signals(id)
);
''');

    await db.execute('''
CREATE TABLE IF NOT EXISTS tuning_params(
  id INTEGER PRIMARY KEY,
  updated_ts INTEGER NOT NULL,
  w_support REAL NOT NULL,
  w_resist REAL NOT NULL,
  w_structure REAL NOT NULL,
  thr_confirm REAL NOT NULL
);
''');

    await db.execute('''
CREATE TABLE IF NOT EXISTS tuning_logs(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,
  note TEXT NOT NULL,
  diff_json TEXT NOT NULL
);
''');
  }

  Future<void> close() async {
    final d = _db;
    _db = null;
    if (d != null) await d.close();
  }
}
