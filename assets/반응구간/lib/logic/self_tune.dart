import 'trade_journal.dart';

class SelfTuneState {
  final int conservativeBias;
  final String mode;

  const SelfTuneState({
    required this.conservativeBias,
    required this.mode,
  });
}

class SelfTuner {
  static Future<SelfTuneState> evaluate(TradeJournal journal) async {
    final logs = await journal.recent(limit: 30);
    if (logs.isEmpty) {
      return const SelfTuneState(conservativeBias: 0, mode: '초기');
    }

    int riskSum = 0;
    int noTrade = 0;

    for (final l in logs) {
      riskSum += l.evidence['risk'] ?? 0;
      if (l.decision.contains('NO')) noTrade++;
    }

    final riskAvg = riskSum ~/ logs.length;
    final bias = (riskAvg + noTrade * 5).clamp(0, 100);

    final mode = bias >= 65
        ? '보수'
        : bias >= 35
            ? '중립'
            : '공격';

    return SelfTuneState(conservativeBias: bias, mode: mode);
  }
}