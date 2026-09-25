/// STEP10 - 방향 확정 & 롱/숏 선언 엔진 (v10)
///
/// 목적
/// - 다중 근거 점수를 받아 최종 방향을 3단계로 고정
///   - 롱 우세 / 숏 우세 / 중립(관망)
/// - 신호 남발 방지: 최소 근거 개수(agreeMin) + 점수 차이(deltaMin) 요구
///
/// 입력 예시
/// - longScore: 0~100
/// - shortScore: 0~100
/// - evidenceCount: 실제로 활성화된 근거 개수(예: 0~5)
/// - noTradeLock: 위험/충돌 등으로 엔진이 거래 금지 상태

enum DirectionSide { long, short, watch }

class DirectionDecision {
  final DirectionSide side;
  final String label; // 화면표시(한글)
  final String reason; // 짧은 사유
  final double confidence; // 0~100

  const DirectionDecision({
    required this.side,
    required this.label,
    required this.reason,
    required this.confidence,
  });
}

class DirectionGateV10 {
  final int agreeMin;
  final double deltaMin;

  const DirectionGateV10({
    this.agreeMin = 3,
    this.deltaMin = 12.0,
  });

  DirectionDecision decide({
    required double longScore,
    required double shortScore,
    required int evidenceCount,
    bool noTradeLock = false,
  }) {
    // 거래 금지 우선
    if (noTradeLock) {
      return const DirectionDecision(
        side: DirectionSide.watch,
        label: '거래 금지',
        reason: '위험/충돌이 높음',
        confidence: 0,
      );
    }

    // 근거 부족 = 관망
    if (evidenceCount < agreeMin) {
      return DirectionDecision(
        side: DirectionSide.watch,
        label: '관망',
        reason: '근거 부족 ($evidenceCount/$agreeMin)',
        confidence: _clamp01((evidenceCount / agreeMin)) * 40.0,
      );
    }

    final double delta = longScore - shortScore;
    final double absDelta = delta.abs();

    // 점수 차이 부족 = 관망
    if (absDelta < deltaMin) {
      return DirectionDecision(
        side: DirectionSide.watch,
        label: '중립',
        reason: '방향 차이 작음 (${absDelta.toStringAsFixed(1)})',
        confidence: 45.0,
      );
    }

    // 방향 확정
    if (delta >= deltaMin) {
      return DirectionDecision(
        side: DirectionSide.long,
        label: '롱 우세',
        reason: '롱 점수 우세 (+${absDelta.toStringAsFixed(1)})',
        confidence: _toConf(absDelta, evidenceCount),
      );
    }

    return DirectionDecision(
      side: DirectionSide.short,
      label: '숏 우세',
      reason: '숏 점수 우세 (+${absDelta.toStringAsFixed(1)})',
      confidence: _toConf(absDelta, evidenceCount),
    );
  }

  double _toConf(double absDelta, int evidenceCount) {
    // delta가 커질수록, 근거가 많을수록 신뢰도 상승
    final double d = (absDelta / 40.0).clamp(0.0, 1.0);
    final double e = (evidenceCount / 5.0).clamp(0.0, 1.0);
    return (55.0 + 35.0 * d + 10.0 * e).clamp(0.0, 100.0);
  }

  double _clamp01(double v) => v.clamp(0.0, 1.0).toDouble();
}
