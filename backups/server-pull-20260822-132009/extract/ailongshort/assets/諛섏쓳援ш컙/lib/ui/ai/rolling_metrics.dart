import 'trade_log_db.dart';

/// Convenience wrapper: rolling metrics for chart AI
class RollingMetrics {
  /// Rolling hit rate (0~100) for a given symbol/tf.
  static Future<double> hitRatePct(String symbol, String tf, {int n = 20}) async {
    return TradeLogDb.rollingHitRatePct(symbol: symbol, tf: tf, lastN: n);
  }

  /// Neutral-safe hit rate if DB empty or error (handled upstream).
  static double fallback() => 50.0;
}