import 'package:sqflite/sqflite.dart';
import 'app_db.dart';

class SignalRow {
  final int? id;
  final int ts;
  final String symbol;
  final String tf;
  final String dir;
  final int confidence;
  final double entry;
  final double sl;
  final double tp;
  final double rr;
  final double leverage;
  final String status;
  final int expireTs;
  final double? supLow;
  final double? supHigh;
  final int? supProb;
  final double? resLow;
  final double? resHigh;
  final int? resProb;
  final String reason;

  SignalRow({
    this.id,
    required this.ts,
    required this.symbol,
    required this.tf,
    required this.dir,
    required this.confidence,
    required this.entry,
    required this.sl,
    required this.tp,
    required this.rr,
    required this.leverage,
    this.status = 'OPEN',
    this.expireTs = 0,
    required this.supLow,
    required this.supHigh,
    required this.supProb,
    required this.resLow,
    required this.resHigh,
    required this.resProb,
    required this.reason,
  });

  Map<String, Object?> toMap() => {
        'id': id,
        'ts': ts,
        'symbol': symbol,
        'tf': tf,
        'dir': dir,
        'confidence': confidence,
        'entry': entry,
        'sl': sl,
        'tp': tp,
        'rr': rr,
        'leverage': leverage,
        'status': status,
        'expire_ts': expireTs,
        'sup_low': supLow,
        'sup_high': supHigh,
        'sup_prob': supProb,
        'res_low': resLow,
        'res_high': resHigh,
        'res_prob': resProb,
        'reason': reason,
      };
}

class SignalDao {
  Future<int> insert(SignalRow row) async {
    final db = await AppDb.I.db;
    return db.insert('signals', row.toMap(), conflictAlgorithm: ConflictAlgorithm.replace);
  }

  Future<List<Map<String, Object?>>> openSignals(int limit) async {
    final db = await AppDb.I.db;
    return db.query('signals', where: "status='OPEN'", orderBy: 'ts DESC', limit: limit);
  }

  Future<void> closeSignal(int id) async {
    final db = await AppDb.I.db;
    await db.update('signals', {'status': 'CLOSED'}, where: 'id=?', whereArgs: [id]);
  }
}
