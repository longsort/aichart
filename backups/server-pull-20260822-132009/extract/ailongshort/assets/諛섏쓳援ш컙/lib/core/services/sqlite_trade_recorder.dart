import 'dart:async';
import '../models/fu_state.dart';
import '../db/signal_dao.dart';
import '../db/outcome_dao.dart';
import '../autotune/auto_tune.dart';

class SqliteTradeRecorder {
  SqliteTradeRecorder._();
  static final SqliteTradeRecorder I = SqliteTradeRecorder._();

  final SignalDao _sig = SignalDao();
  final OutcomeDao _out = OutcomeDao();
  final AutoTune _tune = AutoTune();

  int? _activeId;
  int _lastSignalAtMs = 0;
  String _lastKey = '';

  // UI가 통계 화면 자동 갱신할 때 쓸 수 있는 ping
  final StreamController<int> _tick = StreamController<int>.broadcast();
  Stream<int> get tick => _tick.stream;
  void _ping() => _tick.add(DateTime.now().millisecondsSinceEpoch);

  Future<void> onState(FuState s) async {
    // 1) 신호 저장(확정만)
    await _maybeInsertSignal(s);

    // 2) 열려있는 신호 판정(TP/SL/만료)
    await _maybeCloseByPrice(s.price);
  }

  Future<void> _maybeInsertSignal(FuState s) async {
    // 기록 조건: 확정 신호만
    //  - showSignal + (LONG/SHORT)
    //  - 또는 P-LOCK 활성(확정 방향을 유지)
    final lockedDir = s.pLocked ? s.pLockDir.toUpperCase() : '';
    final liveDir = s.signalDir.toString().toUpperCase();
    final dir = (lockedDir.contains('LONG') || lockedDir.contains('SHORT'))
        ? lockedDir
        : liveDir;

    final isTradeDir = dir.contains('LONG') || dir.contains('SHORT');
    final title = (s.decisionTitle ?? '').toString();
    final titleConfirmed = title.contains('확정') || title.toUpperCase().contains('CONFIRM');
    final isConfirmed = (s.pLocked && isTradeDir) || (s.showSignal && isTradeDir && titleConfirmed);
    if (!isConfirmed) return;

    final now = DateTime.now().millisecondsSinceEpoch;
    final key = '${s.symbol}|${s.tfLabel}|$dir|${s.entry.toStringAsFixed(2)}|${s.stop.toStringAsFixed(2)}|${s.target.toStringAsFixed(2)}';

    // 20초 중복 방지 + 같은 키 중복 방지
    if (now - _lastSignalAtMs < 20000 && key == _lastKey) return;

    final entry = (s.entry > 0) ? s.entry : s.price;
    final sl = (s.stop > 0) ? s.stop : (dir.contains('LONG') ? entry * 0.99 : entry * 1.01);
    final tp = (s.target > 0) ? s.target : (dir.contains('LONG') ? entry * 1.02 : entry * 0.98);
    final rr = (s.rr.isFinite && s.rr > 0) ? s.rr : 1.0;
    final lev = (s.leverage > 0) ? s.leverage : 1.0;

    final expire = now + _tfMs(s.tfLabel) * 20; // 20캔들 만료
    final row = SignalRow(
      ts: now,
      symbol: s.symbol,
      tf: s.tfLabel,
      dir: dir.contains('LONG') ? 'LONG' : 'SHORT',
      confidence: s.confidence.round().clamp(0, 100),
      entry: entry,
      sl: sl,
      tp: tp,
      rr: rr,
      leverage: lev,
      status: 'OPEN',
      expireTs: expire,
      supLow: s.reactLow > 0 ? s.reactLow : null,
      supHigh: s.reactHigh > 0 ? s.reactHigh : null,
      supProb: s.reactionSupportProb,
      resLow: s.resistLow > 0 ? s.resistLow : null,
      resHigh: s.resistHigh > 0 ? s.resistHigh : null,
      resProb: s.reactionResistProb,
      reason: s.finalDecisionReason,
    );

    final id = await _sig.insert(row);
    _activeId = id;
    _lastSignalAtMs = now;
    _lastKey = key;
    _ping();
  }

  Future<void> _maybeCloseByPrice(double px) async {
    final id = _activeId;
    if (id == null) return;

    // openSignals에서 최신 1개를 다시 읽어서 안전하게 판정
    final open = await _sig.openSignals(1);
    if (open.isEmpty) return;
    final s = open.first;

    final sid = s['id'] as int;
    final dir = (s['dir'] as String?) ?? '';
    final entry = (s['entry'] as num).toDouble();
    final sl = (s['sl'] as num).toDouble();
    final tp = (s['tp'] as num).toDouble();
    final expire = (s['expire_ts'] as int?) ?? 0;

    final now = DateTime.now().millisecondsSinceEpoch;

    bool? win;
    String method = 'TIMEOUT';

    if (dir == 'LONG') {
      if (px >= tp) { win = true; method = 'TP'; }
      else if (px <= sl) { win = false; method = 'SL'; }
    } else if (dir == 'SHORT') {
      if (px <= tp) { win = true; method = 'TP'; }
      else if (px >= sl) { win = false; method = 'SL'; }
    }

    if (win == null) {
      if (expire > 0 && now >= expire) {
        // 만료면 0R로 닫기(보수적으로 LOSS로 처리하면 튜닝이 과도해질 수 있음)
        win = false;
        method = 'TIMEOUT';
      } else {
        return;
      }
    }

    final pnlR = win ? 1.0 : -1.0;

    await _out.insert(
      signalId: sid,
      tsClose: now,
      result: win ? 'WIN' : 'LOSS',
      pnl: pnlR,
      method: method,
    );

    await _sig.closeSignal(sid);
    _activeId = null;

    // 자율보정 1회 실행
    await _tune.run();
    _ping();
  }

  int _tfMs(String tf) {
    final t = tf.toLowerCase();
    if (t.contains('5m')) return 5 * 60 * 1000;
    if (t.contains('15m')) return 15 * 60 * 1000;
    if (t.contains('30m')) return 30 * 60 * 1000;
    if (t.contains('1h')) return 60 * 60 * 1000;
    if (t.contains('4h')) return 4 * 60 * 60 * 1000;
    if (t.contains('1d') || t.contains('1D')) return 24 * 60 * 60 * 1000;
    if (t.contains('1w')) return 7 * 24 * 60 * 60 * 1000;
    if (t.contains('1m')) return 30 * 24 * 60 * 60 * 1000;
    return 15 * 60 * 1000;
  }
}
