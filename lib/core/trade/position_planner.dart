import 'dart:math';

/// 5% Î¶¨Ïä§??Í≥†Ï†ï ?¨Ï????åÎûò??/// - entry/sl/tp: SR Í∏∞Î∞ò Í∏∞Î≥∏Í∞?/// - qty: (?ÑÌóòÍ∏? / (?êÏ†à??
/// - leverage: 25% ROI Í≤åÏù¥?∏Î? ÎßåÏ°±?òÍ∏∞ ?ÑÌïú ÏµúÏÜå ?àÎ≤ÑÎ¶¨Ï?(?ÅÌïú 50)
class FuPositionPlan {
  final double entry;
  final double sl;
  final double tp;
  final double rr;
  final int leverage;
  final double qty;
  final double riskUsd;
  final double expectedMovePct;

  const FuPositionPlan({
    required this.entry,
    required this.sl,
    required this.tp,
    required this.rr,
    required this.leverage,
    required this.qty,
    required this.riskUsd,
    required this.expectedMovePct,
  });
}

class PositionPlanner {
  static FuPositionPlan build({
    required String dir, // LONG/SHORT
    required double price,
    required double s1,
    required double r1,
    required double atr,
    required double balanceUsd,
    double riskPct = 0.05,
    double roiNeedPct = 0.25,
    int maxLev = 50,
  }) {
    // Í∏∞Î≥∏ Î≤ÑÌçº: ATR??0.25, ÏµúÏÜå 0.05%
    final buf = max(atr * 0.25, price * 0.0005);

    double entry;
    double sl;
    double tp;

    if (dir == 'SHORT') {
      entry = (r1 > 0 ? r1 : price) - buf;
      sl = (r1 > 0 ? r1 : price) + buf;
      tp = (s1 > 0 ? s1 : price) + buf;
    } else {
      entry = (s1 > 0 ? s1 : price) + buf;
      sl = (s1 > 0 ? s1 : price) - buf;
      tp = (r1 > 0 ? r1 : price) - buf;
    }

    // ?êÏ†à??Í∏∞Î???    final stopDist = (entry - sl).abs().clamp(price * 0.0002, double.infinity);
    final takeDist = (tp - entry).abs().clamp(price * 0.0002, double.infinity);
    final rr = takeDist / stopDist;

    // Í∏∞Î? ?òÏùµ???àÎ≤ÑÎ¶¨Ï? ?ÜÏù¥)
    final expectedMovePct = (takeDist / entry).clamp(0.0, 10.0);

    // ROI Í≤åÏù¥??Ï∂©Ï°± ?àÎ≤ÑÎ¶¨Ï?
    final levNeed = expectedMovePct <= 0 ? maxLev : (roiNeedPct / expectedMovePct).ceil();
    final leverage = levNeed.clamp(1, maxLev);

    // 5% ?ÑÌóòÍ∏?    final riskUsd = balanceUsd * riskPct;
    double qty = riskUsd / stopDist;

    // ÎßàÏßÑ ?úÌïú(?†Î¨º): qty*entry/leverage <= balance
    final maxQtyByMargin = balanceUsd * leverage / entry;
    if (qty > maxQtyByMargin) qty = maxQtyByMargin;

    return FuPositionPlan(
      entry: entry,
      sl: sl,
      tp: tp,
      rr: rr,
      leverage: leverage,
      qty: qty,
      riskUsd: riskUsd,
      expectedMovePct: expectedMovePct,
    );
  }

  /// ATR(14) Í∞ÑÎã® Í≥ÑÏÇ∞
  static double atr14(List<double> highs, List<double> lows, List<double> closes) {
    if (highs.length < 15 || lows.length < 15 || closes.length < 15) return 0;
    final n = min(14, highs.length - 1);
    double sum = 0;
    for (int i = highs.length - n; i < highs.length; i++) {
      final prevClose = closes[i - 1];
      final tr = max(highs[i] - lows[i], max((highs[i] - prevClose).abs(), (lows[i] - prevClose).abs()));
      sum += tr;
    }
    return sum / n;
  }
}
