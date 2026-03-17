import '../../models/ultra_result.dart';

class ConsensusLockDecision {
  final bool locked;
  final String direction; // LONG / SHORT / NO
  final int agreeCount;
  final String reason;

  const ConsensusLockDecision({
    required this.locked,
    required this.direction,
    required this.agreeCount,
    required this.reason,
  });

  static const none = ConsensusLockDecision(
    locked: false,
    direction: 'NO',
    agreeCount: 0,
    reason: '',
  );
}

class ConsensusLock {
  /// tfResults: {'5m': UltraResult, '15m': ..., '1H': ..., '4H': ...}
  static ConsensusLockDecision evaluate(Map<String, UltraResult> tfResults) {
    if (tfResults.isEmpty) return ConsensusLockDecision.none;

    int longCnt = 0;
    int shortCnt = 0;

    for (final r in tfResults.values) {
      final t = r.decision.title.toLowerCase();
      if (t.contains('short') || t.contains('숏') || t.contains('하락')) shortCnt++;
      if (t.contains('long') || t.contains('롱') || t.contains('상승')) longCnt++;
    }

    final dir = (longCnt >= shortCnt) ? 'LONG' : 'SHORT';
    final agree = (dir == 'LONG') ? longCnt : shortCnt;

    // ✅ 핵심: 3개 이상 합의 아니면 LOCK
    if (agree < 3) {
      return ConsensusLockDecision(
        locked: true,
        direction: 'NO',
        agreeCount: agree,
        reason: '멀티TF 합의 부족 ($agree/4)',
      );
    }

    return ConsensusLockDecision(
      locked: false,
      direction: dir,
      agreeCount: agree,
      reason: '멀티TF 합의 OK ($agree/4)',
    );
  }
}