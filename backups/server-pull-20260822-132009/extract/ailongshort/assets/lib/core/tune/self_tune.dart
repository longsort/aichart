import 'package:sqflite/sqflite.dart';
import '../log/log_db.dart';

class TuneState {
  final int winStreak;
  final int lossStreak;
  final int effectiveMinProb; // auto-adjusted notify min prob
  final int lockUntilTs; // epoch ms, 0 = no lock
  final int lastClosedWinRate; // recent closed trades winrate
  final String reason; // human-readable explanation

  const TuneState({
    required this.winStreak,
    required this.lossStreak,
    required this.effectiveMinProb,
    required this.lockUntilTs,
    required this.lastClosedWinRate,
    required this.reason,
  });

  bool get locked => lockUntilTs > DateTime.now().millisecondsSinceEpoch;
  int get remainSec => locked ? ((lockUntilTs - DateTime.now().millisecondsSinceEpoch) ~/ 1000) : 0;
}

class SelfTune {
  static bool enabled = true;

  static Future<Database> _db() async {
    final db = await _DB.db();
    await _ensureTables(db);
    return db;
  }

  static Future<void> _ensureTables(Database db) async {
    await db.execute('''
      CREATE TABLE IF NOT EXISTS tune_state(
        id INTEGER PRIMARY KEY,
        winStreak INTEGER,
        lossStreak INTEGER,
        effectiveMinProb INTEGER,
        lockUntilTs INTEGER,
        lastClosedWinRate INTEGER,
        reason TEXT
      )
    ''');
    await db.execute('''
      CREATE TABLE IF NOT EXISTS tune_logs(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ts INTEGER,
        event TEXT,
        detail TEXT
      )
    ''');

    final rows = await db.query('tune_state', where: 'id=1');
    if (rows.isEmpty) {
      await db.insert('tune_state', {
        'id': 1,
        'winStreak': 0,
        'lossStreak': 0,
        'effectiveMinProb': 70,
        'lockUntilTs': 0,
        'lastClosedWinRate': 0,
        'reason': '초기값(70%)',
      });
    }
  }

  static Future<TuneState> getState() async {
    final db = await _db();
    final rows = await db.query('tune_state', where: 'id=1', limit: 1);
    final m = rows.first;
    return TuneState(
      winStreak: (m['winStreak'] ?? 0) as int,
      lossStreak: (m['lossStreak'] ?? 0) as int,
      effectiveMinProb: (m['effectiveMinProb'] ?? 70) as int,
      lockUntilTs: (m['lockUntilTs'] ?? 0) as int,
      lastClosedWinRate: (m['lastClosedWinRate'] ?? 0) as int,
      reason: (m['reason'] ?? '') as String,
    );
  }

  /// v2: 최근 N개(기본 30개) '종료된' 기록을 보고 최소확률을 자동 재계산한다.
  static Future<void> refreshFromLogs({int window = 30}) async {
    if (!enabled) return;
    final db = await _db();

    final list = await LogDB.recent(limit: 500);
    int win = 0, loss = 0;
    for (final x in list) {
      if (x.status != 'CLOSED') continue;
      if (x.result == 'WIN') win++;
      if (x.result == 'LOSS') loss++;
      if (win + loss >= window) break;
    }
    final total = win + loss;
    final wr = total == 0 ? 0 : ((win / total) * 100).round();

    int minProb = 70;
    String reason = '';

    if (total < 10) {
      minProb = 70;
      reason = '표본이 부족해서 기준 유지(최근 종료 $total개)';
    } else if (wr >= 60) {
      // 완화: 승률이 높을수록 더 완화(최저 60)
      minProb = (68 - ((wr - 60) ~/ 5)).clamp(60, 70);
      reason = '최근 승률 ${wr}% → 기준 완화(${minProb}%)';
    } else if (wr < 45) {
      // 강화: 승률이 낮을수록 더 강화(최대 80)
      minProb = (72 + ((45 - wr) ~/ 3)).clamp(70, 80);
      reason = '최근 승률 ${wr}% → 기준 강화(${minProb}%)';
    } else {
      minProb = 70;
      reason = '최근 승률 ${wr}% → 기본 기준(70%)';
    }

    await db.update(
      'tune_state',
      {
        'effectiveMinProb': minProb,
        'lastClosedWinRate': wr,
        'reason': reason,
      },
      where: 'id=1',
      whereArgs: const [1],
    );
  }

  static Future<void> onResult({required String result}) async {
    if (!enabled) return;
    final db = await _db();
    final st = await getState();

    int winStreak = st.winStreak;
    int lossStreak = st.lossStreak;
    int lockUntil = st.lockUntilTs;

    if (result == 'WIN') {
      winStreak += 1;
      lossStreak = 0;
      await _log(db, 'WIN', '승리 → 연승 $winStreak');
    } else if (result == 'LOSS') {
      lossStreak += 1;
      winStreak = 0;
      if (lossStreak >= 3) {
        lockUntil = DateTime.now().add(const Duration(minutes: 20)).millisecondsSinceEpoch;
        await _log(db, 'LOCK', '3연패 → NO-TRADE 20분 잠금');
      } else {
        await _log(db, 'LOSS', '패배 → 연패 $lossStreak');
      }
    }

    await db.update(
      'tune_state',
      {
        'winStreak': winStreak,
        'lossStreak': lossStreak,
        'lockUntilTs': lockUntil,
      },
      where: 'id=1',
      whereArgs: const [1],
    );

    await refreshFromLogs(window: 30);
  }

  static Future<void> clearLock() async {
    final db = await _db();
    await db.update('tune_state', {'lockUntilTs': 0, 'lossStreak': 0}, where: 'id=1', whereArgs: const [1]);
    await _log(db, 'UNLOCK', '사용자 해제 → 잠금 해제');
  }

  static Future<List<Map<String, Object?>>> recentLogs({int limit = 200}) async {
    final db = await _db();
    return db.query('tune_logs', orderBy: 'ts DESC', limit: limit);
  }

  static Future<void> _log(Database db, String event, String detail) async {
    await db.insert('tune_logs', {
      'ts': DateTime.now().millisecondsSinceEpoch,
      'event': event,
      'detail': detail,
    });
  }
}

class _DB {
  static Database? _db;
  static Future<Database> db() async {
    if (_db != null) return _db!;
    _db = await openDatabase(
      await _path(),
      version: 1,
    );
    return _db!;
  }

  static Future<String> _path() async {
    final p = await getDatabasesPath();
    return '$p/fulink_logs.db';
  }
}
