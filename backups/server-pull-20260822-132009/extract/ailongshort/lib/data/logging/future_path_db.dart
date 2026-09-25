import 'dart:convert';
import 'package:sqflite/sqflite.dart';
import 'package:path/path.dart';
import '../../core/models/future_path_dto.dart';

class FuturePathDb {
  FuturePathDb._();
  static final FuturePathDb I = FuturePathDb._();

  Database? _db;

  Future<Database> _open() async {
    if (_db != null) return _db!;
    final p = join(await getDatabasesPath(), 'fulink_futurepaths.db');
    _db = await openDatabase(
      p,
      version: 1,
      onCreate: (db, v) async {
        await db.execute('''
          CREATE TABLE IF NOT EXISTS future_paths(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ts INTEGER NOT NULL,
            symbol TEXT NOT NULL,
            tf TEXT NOT NULL,
            selected INTEGER NOT NULL,
            probMain INTEGER NOT NULL,
            probAlt INTEGER NOT NULL,
            probFail INTEGER NOT NULL,
            inv REAL NOT NULL,
            t1 REAL NOT NULL,
            t2 REAL NOT NULL,
            json TEXT NOT NULL
          );
        ''');
        await db.execute('CREATE INDEX IF NOT EXISTS idx_future_paths_ts ON future_paths(ts);');
        await db.execute('CREATE INDEX IF NOT EXISTS idx_future_paths_sym_tf ON future_paths(symbol, tf);');
      },
    );
    return _db!;
  }

  Future<void> add(FuturePathDTO dto) async {
    final db = await _open();
    await db.insert('future_paths', {
      'ts': dto.generatedAt.millisecondsSinceEpoch,
      'symbol': dto.symbol,
      'tf': dto.tf,
      'selected': dto.selected,
      'probMain': dto.probMain,
      'probAlt': dto.probAlt,
      'probFail': dto.probFail,
      'inv': dto.levels.inv,
      't1': dto.levels.t1,
      't2': dto.levels.t2,
      'json': jsonEncode(dto.toJson()),
    });
  }
}
