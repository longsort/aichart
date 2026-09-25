import 'dart:math' as math;

/// NO-TRADE 자동 잠금 엔진 (v1)
/// 조건:
/// 1) 연속 손실 >= maxConsecutiveLoss -> LOCK
/// 2) 변동성 과열(atrPct >= atrOverheatPct) -> LOCK
/// 3) 멀티TF 방향 불일치(disagreeCount >= maxDisagree) -> LOCK
///
/// 해제:
/// - lockMinDuration 지나고, 조건 모두 완화되면 UNLOCK
class NoTradeLockEngine {
  final int maxConsecutiveLoss;
  final int maxDisagree;
  final double atrOverheatPct;

  final Duration lockMinDuration;

  bool locked = false;
  int lockedAtMs = 0;
  String reason = '';

  NoTradeLockEngine({
    this.maxConsecutiveLoss = 3,
    this.maxDisagree = 2,
    this.atrOverheatPct = 2.2, // ATR% (atr/price*100)
    this.lockMinDuration = const Duration(minutes: 30),
  });

  /// Update lock status with latest metrics.
  ///
  /// - consecutiveLoss: 최근 연속 손실 횟수
  /// - atrPct: ATR% (atr/price*100)
  /// - disagreeCount: 멀티TF 방향 불일치 카운트 (예: 15m/1h/4h/1D 중 서로 반대면 증가)
  /// - nowMs: 현재 시간(ms)
  void update({
    required int consecutiveLoss,
    required double atrPct,
    required int disagreeCount,
    required int nowMs,
  }) {
    final hitLoss = consecutiveLoss >= maxConsecutiveLoss;
    final overheat = atrPct >= atrOverheatPct;
    final disagree = disagreeCount >= maxDisagree;

    if (!locked) {
      if (hitLoss || overheat || disagree) {
        locked = true;
        lockedAtMs = nowMs;
        reason = _reason(hitLoss: hitLoss, overheat: overheat, disagree: disagree, consecutiveLoss: consecutiveLoss, atrPct: atrPct, disagreeCount: disagreeCount);
      }
      return;
    }

    // already locked
    final elapsed = nowMs - lockedAtMs;
    final minDurMs = lockMinDuration.inMilliseconds;

    // Keep locked at least min duration
    if (elapsed < minDurMs) return;

    // Unlock only if all conditions cleared
    if (!hitLoss && !overheat && !disagree) {
      locked = false;
      reason = '';
      lockedAtMs = 0;
    } else {
      // update reason (may change)
      reason = _reason(hitLoss: hitLoss, overheat: overheat, disagree: disagree, consecutiveLoss: consecutiveLoss, atrPct: atrPct, disagreeCount: disagreeCount);
    }
  }

  /// Estimated remaining lock time (ms). 0 if not locked or min duration passed.
  int remainingMs(int nowMs) {
    if (!locked) return 0;
    final elapsed = nowMs - lockedAtMs;
    final minDurMs = lockMinDuration.inMilliseconds;
    return math.max(0, minDurMs - elapsed);
  }

  String _reason({
    required bool hitLoss,
    required bool overheat,
    required bool disagree,
    required int consecutiveLoss,
    required double atrPct,
    required int disagreeCount,
  }) {
    final parts = <String>[];
    if (hitLoss) parts.add('연속손실 $consecutiveLoss회');
    if (overheat) parts.add('과열 ATR% ${atrPct.toStringAsFixed(2)}');
    if (disagree) parts.add('방향불일치 $disagreeCount');
    return parts.join(' · ');
  }
}