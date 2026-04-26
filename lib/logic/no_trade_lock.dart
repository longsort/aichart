// lib/logic/no_trade_lock.dart
//
// ????• : NO-TRADE ?ë™ ? ê¸ˆ ?íƒœ/?ì •ë§??´ë‹¹
// ??UltraEngine ê°™ì? ë¶„ì„ ?”ì§„ ?ˆë? ?ì? ?ŠìŒ (ì¶©ëŒ ?ì¸)

class NoTradeLockState {
  final bool locked;
  final String reason;
  final Duration? eta;
  final int severity; // 1~5

  const NoTradeLockState({
    required this.locked,
    required this.reason,
    required this.eta,
    required this.severity,
  });

  static const off = NoTradeLockState(
    locked: false,
    reason: '',
    eta: null,
    severity: 0,
  );
}

class NoTradeLockEngine {
  /// ì´ˆë³´ ë³´í˜¸??? ê¸ˆ:
  /// - ?„í—˜??riskScore) ?’ê³ 
  /// - TF ?©ì˜(agreeCount) ??œ¼ë©?
  /// => ?ë™ ? ê¸ˆ
  ///
  /// riskScore: 0~100 (?’ì„?˜ë¡ ?„í—˜)
  /// agreeCount: ?©ì˜??TF ??(0~totalTf)
  static NoTradeLockState evaluate({
    required int riskScore,
    required int agreeCount,
    int totalTf = 5,
  }) {
    // ?ˆì „ ?¥ì¹˜
    final r = riskScore.clamp(0, 100);
    final a = agreeCount.clamp(0, totalTf);

    final highRisk = r >= 75;
    final midRisk = r >= 65;

    final lowAgree = a <= 1;
    final midAgree = a <= 2;

    if (highRisk && lowAgree) {
      return const NoTradeLockState(
        locked: true,
        reason: '?„í—˜???’ìŒ + TF ?©ì˜ ë¶€ì¡?,
        eta: Duration(minutes: 25),
        severity: 5,
      );
    }

    if (highRisk && midAgree) {
      return const NoTradeLockState(
        locked: true,
        reason: '?„í—˜???’ìŒ + ?©ì˜ ?½í•¨',
        eta: Duration(minutes: 15),
        severity: 4,
      );
    }

    if (midRisk && lowAgree) {
      return const NoTradeLockState(
        locked: true,
        reason: 'ë³€?™ì„±/ë¦¬ìŠ¤??+ ?©ì˜ ë¶€ì¡?,
        eta: Duration(minutes: 12),
        severity: 3,
      );
    }

    return NoTradeLockState.off;
  }
}