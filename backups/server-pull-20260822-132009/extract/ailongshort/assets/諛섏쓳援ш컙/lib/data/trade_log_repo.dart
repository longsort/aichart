import 'package:sqflite/sqflite.dart';
import 'trade_log_db.dart';
import 'trade_models.dart';

/// Insert/Update helper for trade_logs
class TradeLogRepo {
  static Future<int> insertPlan(TradePlan plan) async {
    final Database d = await TradeLogDb.db();
    return d.insert('trade_logs', {
      'symbol': plan.symbol,
      'tf': plan.tf,
      'direction': plan.direction,
      'entry': plan.entry,
      'sl': plan.sl,
      'tp': plan.tps.isNotEmpty ? plan.tps.last : null,
      'rr': plan.rr,
      'evidence_score': plan.evidenceScore,
      'regime': plan.regime,
      'mae': 0.0,
      'mfe': 0.0,
      'result': 'CANCEL', // will be updated when judged
      'created_at': plan.createdAtMs,
    });
  }

  static Future<void> updateOutcome({
    required int id,
    required TradeOutcome o,
  }) async {
    final Database d = await TradeLogDb.db();
    await d.update(
      'trade_logs',
      {
        'mae': o.mae,
        'mfe': o.mfe,
        'result': o.result,
        'created_at': o.closedAtMs, // keep newest time for rolling queries (simpler)
      },
      where: 'id = ?',
      whereArgs: [id],
    );
  }
}