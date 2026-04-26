import 'package:sqflite/sqflite.dart';
import '../db.dart';
import '../../exchange/dto/candle_dto.dart';

/// ìº”ë“¤ DAO ??UI/Repo??DAOë¥??µí•´?œë§Œ DB ?‘ê·¼. S-10: ë°°ì¹˜ ?¬ê¸° ?œí•œ?¼ë¡œ DB ë¶€???„í™”
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
