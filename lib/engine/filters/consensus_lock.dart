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
      if (t.contains('short') || t.contains('??) || t.contains('?òÎùΩ')) shortCnt++;
      if (t.contains('long') || t.contains('Î°?) || t.contains('?ÅÏäπ')) longCnt++;
    }

    final dir = (longCnt >= shortCnt) ? 'LONG' : 'SHORT';
    final agree = (dir == 'LONG') ? longCnt : shortCnt;

    // ???µÏã¨: 3Í∞??¥ÏÉÅ ?©Ïùò ?ÑÎãàÎ©?LOCK
    if (agree < 3) {
      return ConsensusLockDecision(
        locked: true,
        direction: 'NO',
        agreeCount: agree,
        reason: 'Î©Ä?∞TF ?©Ïùò Î∂ÄÏ°?($agree/4)',
      );
    }

    return ConsensusLockDecision(
      locked: false,
      direction: dir,
      agreeCount: agree,
      reason: 'Î©Ä?∞TF ?©Ïùò OK ($agree/4)',
    );
  }
}