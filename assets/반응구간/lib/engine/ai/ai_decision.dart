import '../core/core_engine.dart';

class AiDecisionOut {
  final String decision; // LONG/SHORT/NO-TRADE
  final int longPct;
  final int shortPct;
  final int noTradePct;
  final String oneLine;

  const AiDecisionOut({
    required this.decision,
    required this.longPct,
    required this.shortPct,
    required this.noTradePct,
    required this.oneLine,
  });
}

class AiDecision {
  AiDecisionOut decide(CoreSnapshot s) {
    final longPct = s.breakoutUpPct.round().clamp(0, 100);
    final shortPct = s.breakoutDownPct.round().clamp(0, 100);
    final noTradePct = (100 - (longPct + shortPct)).clamp(0, 100);
    final decision = (noTradePct >= 50)
        ? 'NO-TRADE'
        : (longPct >= shortPct ? 'LONG' : 'SHORT');

    final oneLine = 'TF ${s.tf} · WHALE ${s.whaleGrade} · RISK ${(s.risk01 * 100).round()}';
    return AiDecisionOut(
      decision: decision,
      longPct: longPct,
      shortPct: shortPct,
      noTradePct: noTradePct,
      oneLine: oneLine,
    );
  }
}
