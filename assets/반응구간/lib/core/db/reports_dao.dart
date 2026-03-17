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
    WHEN (strftime('%H', datetime(o.ts_close/1000, 'unixepoch', 'localtime')) BETWEEN '06' AND '11') THEN '아침(06-11)'
    WHEN (strftime('%H', datetime(o.ts_close/1000, 'unixepoch', 'localtime')) BETWEEN '12' AND '17') THEN '오후(12-17)'
    WHEN (strftime('%H', datetime(o.ts_close/1000, 'unixepoch', 'localtime')) BETWEEN '18' AND '23') THEN '야간(18-23)'
    ELSE '심야(00-05)'
  END AS k,
  SUM(CASE WHEN o.result='WIN' THEN 1 ELSE 0 END) AS w,
  SUM(CASE WHEN o.result='LOSS' THEN 1 ELSE 0 END) AS l
FROM outcomes o
JOIN signals s ON s.id = o.signal_id
ORDER BY o.ts_close DESC
LIMIT ?
''', [n]);
  }

  /// 개발/테스트용: 통계 화면이 0%로만 보일 때, UI/DB 연결을 확인하기 위한 더미 데이터 생성.
  /// - signals/outcomes/performance 에 최소 샘플을 넣는다.
  /// - 기존 데이터는 유지한다(추가만).
  Future<void> seedDemoData({int n = 30}) async {
    final db = await AppDb.I.db;
    final rng = Random();
    final baseTs = DateTime.now().millisecondsSinceEpoch;

    await db.transaction((txn) async {
      for (int i = 0; i < n; i++) {
        final ts = baseTs - (n - i) * 60 * 60 * 1000; // 1h 간격
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
        // 55% 확률로 win, 나머지 loss
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
