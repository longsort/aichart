import 'dart:math';

import 'app_db.dart';

class ReportsDao {
  Future<List<Map<String, Object?>>> lastSignalsWithOutcomes(int n) async {
    final db = await AppDb.I.db;
    return db.rawQuery('''
SELECT s.id, s.ts, s.symbol, s.tf, s.dir, s.confidence, s.entry, s.sl, s.tp, s.rr, s.leverage,
       o.ts_close, o.result, o.method, o.pnl
FROM signals s
LEFT JOIN outcomes o ON o.signal_id = s.id
ORDER BY s.ts DESC
LIMIT ?
''', [n]);
  }

  Future<List<Map<String, Object?>>> recentTuningLogs(int n) async {
    final db = await AppDb.I.db;
    return db.query('tuning_logs', orderBy: 'ts DESC', limit: n);
  }

  Future<List<Map<String, Object?>>> winrateBySession(int n) async {
    final db = await AppDb.I.db;
    return db.rawQuery('''
SELECT 
  CASE
    WHEN (strftime('%H', datetime(o.ts_close/1000, 'unixepoch', 'localtime')) BETWEEN '06' AND '11') THEN '?ÑÏπ®(06-11)'
    WHEN (strftime('%H', datetime(o.ts_close/1000, 'unixepoch', 'localtime')) BETWEEN '12' AND '17') THEN '?§ÌõÑ(12-17)'
    WHEN (strftime('%H', datetime(o.ts_close/1000, 'unixepoch', 'localtime')) BETWEEN '18' AND '23') THEN '?ºÍ∞Ñ(18-23)'
    ELSE '?¨Ïïº(00-05)'
  END AS k,
  SUM(CASE WHEN o.result='WIN' THEN 1 ELSE 0 END) AS w,
  SUM(CASE WHEN o.result='LOSS' THEN 1 ELSE 0 END) AS l
FROM outcomes o
JOIN signals s ON s.id = o.signal_id
ORDER BY o.ts_close DESC
LIMIT ?
''', [n]);
  }

  /// Í∞úÎ∞ú/?åÏä§?∏Ïö©: ?µÍ≥Ñ ?îÎ©¥??0%Î°úÎßå Î≥¥Ïùº ?? UI/DB ?∞Í≤∞???ïÏù∏?òÍ∏∞ ?ÑÌïú ?îÎ? ?∞Ïù¥???ùÏÑ±.
  /// - signals/outcomes/performance ??ÏµúÏÜå ?òÌîå???£Îäî??
  /// - Í∏∞Ï°¥ ?∞Ïù¥?∞Îäî ?†Ï??úÎã§(Ï∂îÍ?Îß?.
  Future<void> seedDemoData({int n = 30}) async {
    final db = await AppDb.I.db;
    final rng = Random();
    final baseTs = DateTime.now().millisecondsSinceEpoch;

    await db.transaction((txn) async {
      for (int i = 0; i < n; i++) {
        final ts = baseTs - (n - i) * 60 * 60 * 1000; // 1h Í∞ÑÍ≤©
        final dir = rng.nextBool() ? 'LONG' : 'SHORT';
        final entry = 70000 + rng.nextInt(20000) + rng.nextDouble();
        final sl = entry + (dir == 'LONG' ? -(500 + rng.nextInt(800)) : (500 + rng.nextInt(800)));
        final tp = entry + (dir == 'LONG' ? (800 + rng.nextInt(1400)) : -(800 + rng.nextInt(1400)));
        final conf = (40 + rng.nextInt(50)).toDouble();

        final signalId = await txn.insert('signals', {
          'ts': ts,
          'symbol': 'BTCUSDT',
          'tf': '15m',
          'dir': dir,
          'grade': 'D',
          'entry': entry,
          'sl': sl,
          'tp': tp,
          'rr': 1.2,
          'confidence': conf,
          'evidenceScore': conf,
          'atr': 0,
          'stophuntRisk': rng.nextInt(100).toDouble(),
          'notes': 'demo',
        });

        final outcome = rng.nextDouble();
        // 55% ?ïÎ•†Î°?win, ?òÎ®∏ÏßÄ loss
        final isWin = outcome < 0.55;
        final pnlPct = isWin ? (0.3 + rng.nextDouble() * 2.0) : -(0.2 + rng.nextDouble() * 1.8);
        final reason = isWin ? 'TP' : 'SL';

        await txn.insert('outcomes', {
          'signalId': signalId,
          'tsClose': ts + (15 + rng.nextInt(180)) * 60 * 1000,
          'result': isWin ? 'WIN' : 'LOSS',
          'pnlPct': pnlPct,
          'closePrice': entry * (1 + pnlPct / 100),
          'reason': reason,
        });

        await txn.insert('performance', {
          'ts': ts,
          'sessionKey': 'demo-15m',
          'winrate': isWin ? 55.0 : 45.0,
          'pnl': pnlPct,
        });
      }
    });
  }
}
