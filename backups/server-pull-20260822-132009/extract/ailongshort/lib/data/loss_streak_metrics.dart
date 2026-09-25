import 'package:sqflite/sqflite.dart';
import 'trade_log_db.dart';

/// Simple helper to compute consecutive losses from trade_logs.
/// Loss defined as result == 'SL' (optionally include TIMEOUT as loss).
class LossStreakMetrics {
  static Future<int> consecutiveLoss({
    String? symbol,
    String? tf,
    int lookback = 50,
    bool timeoutCountsAsLoss = false,
  }) async {
    final Database d = await TradeLogDb.db();

    final where = <String>[];
    final args = <Object?>[];
    if (symbol != null && symbol.isNotEmpty) {
      where.add('symbol = ?');
      args.add(symbol);
    }
    if (tf != null && tf.isNotEmpty) {
      where.add('tf = ?');
      args.add(tf);
    }
    final whereSql = where.isEmpty ? '' : 'WHERE ' + where.join(' AND ');

    final rows = await d.rawQuery('''
SELECT result
FROM trade_logs
$whereSql
ORDER BY created_at DESC
LIMIT ?
''', [...args, lookback]);

    int streak = 0;
    for (final r in rows) {
      final res = (r['result'] as String?)?.toUpperCase() ?? '';
      final isLoss = (res == 'SL') || (timeoutCountsAsLoss && res == 'TIMEOUT');
      if (isLoss) {
        streak += 1;
      } else if (res == 'TP' || res == 'BE') {
        break;
      } else {
        // ignore CANCEL etc.
        continue;
      }
    }
    return streak;
  }
}