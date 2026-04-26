import 'dart:io';
import 'package:sqflite/sqflite.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:path/path.dart';
import 'package:path_provider/path_provider.dart';

/// DB 초기????모바?? sqflite, ?�도: sqflite_common_ffi
class Db {
  static Database? _db;
  static const _name = 'fulink_pro.db';
  static const _version = 2;

  static Future<Database> get database async {
    if (_db != null) return _db!;
    if (Platform.isWindows || Platform.isLinux) {
      sqfliteFfiInit();
    }
    final dir = await getApplicationDocumentsDirectory();
    final path = join(dir.path, _name);
    _db = await openDatabase(path, version: _version, onCreate: _onCreate, onUpgrade: _onUpgrade);
    return _db!;
  }

  static Future<void> _onCreate(Database db, int version) async {
    await db.execute('''
      CREATE TABLE candles (
        symbol TEXT NOT NULL,
        tf TEXT NOT NULL,
        t INTEGER NOT NULL,
        o REAL NOT NULL,
        h REAL NOT NULL,
        l REAL NOT NULL,
        c REAL NOT NULL,
        v REAL NOT NULL,
        PRIMARY KEY (symbol, tf, t)
      )
    ''');
    await db.execute('CREATE INDEX idx_candles_symbol_tf_t ON candles(symbol, tf, t)');
  }

  static Future<void> _onUpgrade(Database db, int oldVersion, int newVersion) async {
    if (oldVersion < 2) {
      await db.execute('''
        CREATE TABLE IF NOT EXISTS signal_log (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          time INTEGER NOT NULL,
          symbol TEXT NOT NULL,
          tf TEXT NOT NULL,
          dir TEXT NOT NULL,
          entry REAL NOT NULL,
          sl REAL NOT NULL,
          tp REAL NOT NULL,
          result TEXT,
          evidence_score INTEGER,
          confidence INTEGER
        )
      ''');
    }
  }
}
