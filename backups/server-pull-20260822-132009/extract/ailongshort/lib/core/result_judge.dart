import 'models/fu_state.dart';
import '../data/trade_log_db.dart';
import 'ai_open_position.dart';

class TuningController {
  TuningController._();
  static final TuningController I = TuningController._();

  int requiredProb = 60; // 기본 진입 ?�률 기�?

  Future<void> updateFromLogs() async {
    final logs = await TradeLogDb.I.fetchRecent(limit: 30);
    final closes = logs.where((e) => e.action == 'CLOSE_AUTO').toList();
    if (closes.length < 6) return;

    int win = 0, loss = 0;
    for (final c in closes.take(20)) {
      if (c.note.startsWith('TP')) win++;
      else if (c.note.startsWith('SL')) loss++;
    }
    final total = win + loss;
    if (total < 6) return;

    final winrate = (win * 100) ~/ total;
    if (winrate < 55) {
      requiredProb = 70;
    } else if (winrate >= 65) {
      requiredProb = 60;
    } else {
      requiredProb = 65;
    }
  }
}

class ResultJudge {
  static int _tfMinutes(String tf) {
    switch (tf) {
      case '5m': return 5;
      case '15m': return 15;
      case '1h': return 60;
      case '4h': return 240;
      case '1D': return 1440;
      default: return 15;
    }
  }

  static Future<void> tick({required FuState st}) async {
    final p = AiOpenPositionStore.open.value;
    if (p == null) return;
    if (st.symbol != p.symbol || st.tf != p.tf) return;
    if (st.price <= 0) return;

    if (p.target > 0 && st.price >= p.target) {
      await _closeAuto('TP', st, '목표 ?�달');
      return;
    }
    if (p.stop > 0 && st.price <= p.stop) {
      await _closeAuto('SL', st, '?�절 ?�달');
      return;
    }

    final timeout = Duration(minutes: _tfMinutes(st.tf) * 12);
    if (DateTime.now().difference(p.openedAt) >= timeout) {
      await _closeAuto('TIMEOUT', st, '?�간 초과(무효)');
      return;
    }
  }

  static Future<void> _closeAuto(String result, FuState st, String reason) async {
    await TradeLogDb.I.insert(
      action: 'CLOSE_AUTO',
      symbol: st.symbol,
      tf: st.tf,
      state: 'CLOSED',
      st: st,
      note: '$result:$reason',
    );
    AiOpenPositionStore.clear();
    await TuningController.I.updateFromLogs();
  }
}
