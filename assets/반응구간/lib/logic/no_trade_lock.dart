// lib/logic/no_trade_lock.dart
//
// ✅ 역할: NO-TRADE 자동 잠금 상태/판정만 담당
// ❌ UltraEngine 같은 분석 엔진 절대 두지 않음 (충돌 원인)

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
  /// 초보 보호형 잠금:
  /// - 위험도(riskScore) 높고
  /// - TF 합의(agreeCount) 낮으면
  /// => 자동 잠금
  ///
  /// riskScore: 0~100 (높을수록 위험)
  /// agreeCount: 합의된 TF 수 (0~totalTf)
  static NoTradeLockState evaluate({
    required int riskScore,
    required int agreeCount,
    int totalTf = 5,
  }) {
    // 안전 장치
    final r = riskScore.clamp(0, 100);
    final a = agreeCount.clamp(0, totalTf);

    final highRisk = r >= 75;
    final midRisk = r >= 65;

    final lowAgree = a <= 1;
    final midAgree = a <= 2;

    if (highRisk && lowAgree) {
      return const NoTradeLockState(
        locked: true,
        reason: '위험도 높음 + TF 합의 부족',
        eta: Duration(minutes: 25),
        severity: 5,
      );
    }

    if (highRisk && midAgree) {
      return const NoTradeLockState(
        locked: true,
        reason: '위험도 높음 + 합의 약함',
        eta: Duration(minutes: 15),
        severity: 4,
      );
    }

    if (midRisk && lowAgree) {
      return const NoTradeLockState(
        locked: true,
        reason: '변동성/리스크 + 합의 부족',
        eta: Duration(minutes: 12),
        severity: 3,
      );
    }

    return NoTradeLockState.off;
  }
}