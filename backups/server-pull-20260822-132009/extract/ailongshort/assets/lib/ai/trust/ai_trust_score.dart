/// Fulink Pro: AI 신뢰도(★) 계산
/// - 외부 브리핑 카피가 아니라 "앱 내부 상태"로만 산출
/// - 목적: 사용자가 "오늘 이 AI를 믿어도 되는지"를 한 눈에 판단

import '../../core/models/fu_state.dart';
import '../../core/trade_guard.dart';

class AiTrustScore {
  final int score; // 0~100
  final int stars; // 1~5
  final String label; // 짧은 한글

  const AiTrustScore({required this.score, required this.stars, required this.label});

  static AiTrustScore compute(FuState s) {
    // 기본값: 데이터 LIVE가 아니면 신뢰도는 낮게
    int v = 55;

    // 데이터 상태
    if (!s.dataLive) v -= 35;

    // 근거(증거)
    v += ((s.evidencePct - 50) * 0.30).round();

    // 위험/스윕 패널티
    v += ((50 - s.risk) * 0.35).round();
    v += ((50 - s.sweepRisk) * 0.20).round();

    // 확률/확정 보너스(남발 방지: LOCK/금지면 0)
    if (!s.locked && s.dataLive) {
      v += ((s.signalProb - 55) * 0.25).round();
    }

    // NO-TRADE(연속 실패/쿨다운)면 추가 하향
    if (TradeGuard.I.isLocked) v -= 25;

    // clamp
    if (v < 0) v = 0;
    if (v > 100) v = 100;

    final stars = v >= 82
        ? 5
        : v >= 70
            ? 4
            : v >= 58
                ? 3
                : v >= 45
                    ? 2
                    : 1;

    final label = stars >= 5
        ? '최상'
        : stars == 4
            ? '높음'
            : stars == 3
                ? '보통'
                : stars == 2
                    ? '낮음'
                    : '주의';

    return AiTrustScore(score: v, stars: stars, label: label);
  }
}
