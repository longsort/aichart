
class NoTradeLock {
  /// ✅ 노트레이드 잠금(안전형)
  /// 조건 예시:
  /// - 근거 일치가 낮음
  /// - 최근 성과가 나쁨(페널티)
  /// - 변동성 과다(추후 ATR 등으로 교체)
  static bool shouldLock({
    required int evidenceHit,
    required int penalty, // 0~25
    required bool volatilityHigh,
  }) {
    if (evidenceHit <= 2) return true;
    if (penalty >= 15) return true;
    if (volatilityHigh) return true;
    return false;
  }
}
