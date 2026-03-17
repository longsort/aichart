
import 'signal_log.dart';

class SignalLogStore {
  static int _nextId = 1;
  static final List<SignalLog> _logs = [];

  static List<SignalLog> get logs => List.unmodifiable(_logs);

  static int open(SignalLog log) {
    final id = (log.id ?? _nextId++);
    final fixed = log.copyWith(
      id: id,
      status: log.status.isEmpty ? 'OPEN' : log.status,
      result: log.result.isEmpty ? 'NONE' : log.result,
    );
    _logs.add(fixed);
    return id;
  }

  static SignalLog createOpen({
    required String symbol,
    required String tf,
    required String dir,
    required int prob,
    required int evidenceHit,
    required int evidenceTotal,
    required int score,
    required int confidence,
    required int risk,
    required double entry,
    required double sl,
    required double tp,
    required double qty,
    required double leverage,
  }) {
    return SignalLog(
      id: null,
      ts: DateTime.now().millisecondsSinceEpoch,
      symbol: symbol,
      tf: tf,
      dir: dir,
      prob: prob,
      evidenceHit: evidenceHit,
      evidenceTotal: evidenceTotal,
      score: score,
      confidence: confidence,
      risk: risk,
      entry: entry,
      sl: sl,
      tp: tp,
      qty: qty,
      leverage: leverage,
      status: 'OPEN',
      result: 'NONE',
      exitPrice: null,
      closedTs: null,
    );
  }

  static void close({
    required int id,
    required String result, // WIN/LOSS
    required double exitPrice,
  }) {
    final i = _logs.indexWhere((x) => x.id == id);
    if (i < 0) return;
    final x = _logs[i];
    _logs[i] = x.copyWith(
      status: 'CLOSED',
      result: result,
      exitPrice: exitPrice,
      closedTs: DateTime.now().millisecondsSinceEpoch,
    );
  }

  static Map<String, int> stats({int limit = 200}) {
    final list = _logs.reversed.take(limit);
    int win = 0, loss = 0, open = 0;
    for (final x in list) {
      if (x.status == 'OPEN') open++;
      if (x.result == 'WIN') win++;
      if (x.result == 'LOSS') loss++;
    }
    final total = win + loss;
    final winRate = total == 0 ? 0 : ((win / total) * 100).round();
    return {'win': win, 'loss': loss, 'open': open, 'total': total, 'winRate': winRate};
  }
}
