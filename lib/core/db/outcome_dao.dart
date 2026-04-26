import 'package:sqflite/sqflite.dart';
import 'app_db.dart';

class OutcomeDao {
  Future<int> insert({
    required int signalId,
    required int tsClose,
    required String result,
    required double pnl,
    required String method,
  }) async {
    final db = await AppDb.I.db;
    return db.insert('outcomes', {
      'signal_id': signalId,
      'ts_close': tsClose,
      'result': result,
      'pnl': pnl,
      'method': method,
    }, conflictAlgorithm: ConflictAlgorithm.replace);
  }

  Future<List<Map<String, Object?>>> lastN(int n) async {
    final db = await AppDb.I.db;
    return db.query('outcomes', orderBy: 'ts_close DESC', limit: n);
  }

  Future<double> winrateLastN(int n) async {
    final rows = await lastN(n);
    if (rows.isEmpty) return 0;
    final w = rows.where((r) => (r['result'] as String) == 'WIN').length;
    return (w / rows.length) * 100.0;
  }
}
