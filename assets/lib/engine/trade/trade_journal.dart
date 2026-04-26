import 'dart:convert';
import 'dart:io';

import 'trade_plan.dart';

class TradeJournal {
  TradeJournal._();
  static final TradeJournal I = TradeJournal._();

  Future<File> _file() async {
    final dir = Directory('${Directory.systemTemp.path}/FulinkPro');
    if (!await dir.exists()) {
      await dir.create(recursive: true);
    }
    return File('${dir.path}/trade_journal.jsonl');
  }

  Future<void> logPlan(TradePlan p) async {
    try {
      final f = await _file();
      await f.writeAsString('${jsonEncode({'type':'PLAN', ...p.toJson()})}\n',
          mode: FileMode.append, flush: true);
    } catch (_) {}
  }

  Future<void> logResult({
    required String symbol,
    required String side,
    required double entry,
    required double exit,
    required double pnlPct,
    required String reason, // 'TP' | 'SL' | 'TIMEOUT' | 'MANUAL'
  }) async {
    try {
      final f = await _file();
      await f.writeAsString(
          '${jsonEncode({
            'type': 'RESULT',
            'symbol': symbol,
            'side': side,
            'entry': entry,
            'exit': exit,
            'pnlPct': pnlPct,
            'reason': reason,
            'tsMs': DateTime.now().millisecondsSinceEpoch,
          })}\n',
          mode: FileMode.append,
          flush: true);
    } catch (_) {}
  }
}
