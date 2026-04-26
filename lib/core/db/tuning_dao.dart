import 'package:sqflite/sqflite.dart';

import 'app_db.dart';
import '../autotune/tuning_params.dart';

class TuningDao {
  Future<TuningParams> loadOrCreate() async {
    final db = await AppDb.I.db;
    final rows = await db.query('tuning_params', where: 'id=1', limit: 1);
    if (rows.isEmpty) {
      final p = TuningParams.defaults();
      await db.insert('tuning_params', p.toMap());
      return p;
    }
    return TuningParams.fromMap(rows.first);
  }

  Future<void> save(TuningParams p) async {
    final db = await AppDb.I.db;
    await db.insert('tuning_params', p.toMap(), conflictAlgorithm: ConflictAlgorithm.replace);
  }

  Future<void> logChange({required String note, required Map<String, Object?> diff}) async {
    final db = await AppDb.I.db;
    await db.insert('tuning_logs', {
      'ts': DateTime.now().millisecondsSinceEpoch,
      'note': note,
      'diff_json': diff.toString(),
    });
  }
}
