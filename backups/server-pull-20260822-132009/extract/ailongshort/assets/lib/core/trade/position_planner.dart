import 'dart:math';

/// 5% 리스크 고정 포지션 플래너
/// - entry/sl/tp: SR 기반 기본값
/// - qty: (위험금) / (손절폭)
/// - leverage: 25% ROI 게이트를 만족하기 위한 최소 레버리지(상한 50)
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
    // 기본 버퍼: ATR의 0.25, 최소 0.05%
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

    // 손절폭/기대폭
    final stopDist = (entry - sl).abs().clamp(price * 0.0002, double.infinity);
    final takeDist = (tp - entry).abs().clamp(price * 0.0002, double.infinity);
    final rr = takeDist / stopDist;

    // 기대 수익폭(레버리지 없이)
    final expectedMovePct = (takeDist / entry).clamp(0.0, 10.0);

    // ROI 게이트 충족 레버리지
    final levNeed = expectedMovePct <= 0 ? maxLev : (roiNeedPct / expectedMovePct).ceil();
    final leverage = levNeed.clamp(1, maxLev);

    // 5% 위험금
    final riskUsd = balanceUsd * riskPct;
    double qty = riskUsd / stopDist;

    // 마진 제한(선물): qty*entry/leverage <= balance
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

  /// ATR(14) 간단 계산
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
