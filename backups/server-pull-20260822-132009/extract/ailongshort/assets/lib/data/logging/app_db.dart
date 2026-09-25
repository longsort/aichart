import 'dart:io';
import 'package:path/path.dart' as p;
import 'package:sqflite_common_ffi/sqflite_ffi.dart';

class AppDb {
  AppDb._();
  static final AppDb I = AppDb._();

  Database? _db;

  Database get db {
    final d = _db;
    if (d == null) throw StateError('DB not initialized');
    return d;
  }

  Future<void> init() async {
    if (_db != null) return;

    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;

    final dir = _defaultDir();
    final dbPath = p.join(dir.path, 'fulink_pro_ultra.db');

    _db = await databaseFactory.openDatabase(
      dbPath,
      options: OpenDatabaseOptions(
        version: 1,
        onCreate: (db, v) async {
          await db.execute('''
            CREATE TABLE IF NOT EXISTS signal_logs(
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              ts INTEGER NOT NULL,
              symbol TEXT NOT NULL,
              exchange TEXT NOT NULL,
              decision TEXT NOT NULL,
              confidence REAL NOT NULL,
              longP REAL NOT NULL,
              shortP REAL NOT NULL,
              evidenceActive INTEGER NOT NULL,
              note TEXT
            );
          ''');
          await db.execute('''
            CREATE TABLE IF NOT EXISTS zone_logs(
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              ts INTEGER NOT NULL,
              symbol TEXT NOT NULL,
              p1 REAL, p2 REAL, p3 REAL, p4 REAL, p5 REAL,
              price REAL NOT NULL,
              support1 REAL, resistance1 REAL,
              support2 REAL, resistance2 REAL,
              support3 REAL, resistance3 REAL,
              support4 REAL, resistance4 REAL,
              support5 REAL, resistance5 REAL
            );
          ''');
        },
      ),
    );
  }

  Directory _defaultDir() {
    final cwd = Directory.current;
    final d = Directory(p.join(cwd.path, 'data'));
    if (!d.existsSync()) d.createSync(recursive: true);
    return d;
  }
}
