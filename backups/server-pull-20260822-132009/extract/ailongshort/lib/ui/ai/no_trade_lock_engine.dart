import 'dart:math' as math;

/// NO-TRADE ?ë™ ? ê¸ˆ ?”ì§„ (v1)
/// ì¡°ê±´:
/// 1) ?°ì† ?ì‹¤ >= maxConsecutiveLoss -> LOCK
/// 2) ë³€?™ì„± ê³¼ì—´(atrPct >= atrOverheatPct) -> LOCK
/// 3) ë©€?°TF ë°©í–¥ ë¶ˆì¼ì¹?disagreeCount >= maxDisagree) -> LOCK
///
/// ?´ì œ:
/// - lockMinDuration ì§€?˜ê³ , ì¡°ê±´ ëª¨ë‘ ?„í™”?˜ë©´ UNLOCK
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
  /// - consecutiveLoss: ìµœê·¼ ?°ì† ?ì‹¤ ?Ÿìˆ˜
  /// - atrPct: ATR% (atr/price*100)
  /// - disagreeCount: ë©€?°TF ë°©í–¥ ë¶ˆì¼ì¹?ì¹´ìš´??(?? 15m/1h/4h/1D ì¤??œë¡œ ë°˜ë?ë©?ì¦ê?)
  /// - nowMs: ?„ì¬ ?œê°„(ms)
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
    if (hitLoss) parts.add('?°ì†?ì‹¤ $consecutiveLoss??);
    if (overheat) parts.add('ê³¼ì—´ ATR% ${atrPct.toStringAsFixed(2)}');
    if (disagree) parts.add('ë°©í–¥ë¶ˆì¼ì¹?$disagreeCount');
    return parts.join(' Â· ');
  }
}