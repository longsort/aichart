import 'dart:math';

/// 미니차트에 AI 개입값만 안전하게 공급하는 브릿지
/// 기존 MiniChartV4 / UI / 캔들 구조 절대 안 건드림
class MiniChartAIBridge {
  final double price;
  final double s1;
  final double r1;

  MiniChartAIBridge({
    required this.price,
    required this.s1,
    required this.r1,
  });

  /// 0~100 신뢰 게이지
  int confidence() {
    if (price <= 0) return 0;
    final dist = (price - s1).abs();
    final range = max(1.0, (r1 - s1).abs());
    return (100 - (dist / range * 100)).clamp(0, 100).toInt();
  }

  /// 0~100 위험도 게이지
  int risk() {
    if (price <= 0) return 0;
    final mid = (s1 + r1) / 2;
    return ((price - mid).abs() / mid * 100)
        .clamp(0, 100)
        .toInt();
  }

  /// 롱/숏 판단용 (-1 ~ 1)
  double bias() {
    if (price <= 0) return 0;
    if (price < s1) return -1;
    if (price > r1) return 1;
    return 0;
  }
}