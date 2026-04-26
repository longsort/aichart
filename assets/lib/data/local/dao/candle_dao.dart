import 'package:sqflite/sqflite.dart';
import '../db.dart';
import '../../exchange/dto/candle_dto.dart';

/// 캔들 DAO — UI/Repo는 DAO를 통해서만 DB 접근. S-10: 배치 크기 제한으로 DB 부하 완화
class CandleDao {
  static const int _batchMax = 500;

  static Future<void> upsertMany(String symbol, String tf, List<CandleDto> candles) async {
    if (candles.isEmpty) return;
    final db = await Db.database;
    final toInsert = candles.length > _batchMax ? candles.sublist(0, _batchMax) : candles;
    final batch = db.batch();
    for (final c in toInsert) {
      batch.insert(
        'candles',
        {'symbol': symbol, 'tf': tf, 't': c.t, 'o': c.o, 'h': c.h, 'l': c.l, 'c': c.c, 'v': c.v},
        conflictAlgorithm: ConflictAlgorithm.replace,
      );
    }
    await batch.commit(noResult: true);
  }

  static Future<List<CandleDto>> loadRecent(String symbol, String tf, int limit) async {
    final db = await Db.database;
    final rows = await db.query(
      'candles',
      where: 'symbol = ? AND tf = ?',
      whereArgs: [symbol, tf],
      orderBy: 't DESC',
      limit: limit.clamp(1, 1000),
    );
    return rows.map((r) => CandleDto(
      t: r['t'] as int,
      o: (r['o'] as num).toDouble(),
      h: (r['h'] as num).toDouble(),
      l: (r['l'] as num).toDouble(),
      c: (r['c'] as num).toDouble(),
      v: (r['v'] as num).toDouble(),
    )).toList();
  }
}
