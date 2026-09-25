import 'package:flutter/material.dart';

/// STEP16-B: 차트 라이브러리 의존 없는 기본 좌표 변환기
/// - indexToX: [leftPad, width-rightPad]에 선형 매핑
/// - priceToY: [topPad, height-bottomPad]에 선형 매핑 (maxPrice가 위)
class BasicChartCoordMapper {
  final int count;
  final double minPrice;
  final double maxPrice;
  final EdgeInsets pad;
  final Size size;

  const BasicChartCoordMapper({
    required this.count,
    required this.minPrice,
    required this.maxPrice,
    required this.size,
    this.pad = const EdgeInsets.fromLTRB(6, 6, 6, 6),
  });

  double indexToX(int idx) {
    final w = (size.width - pad.left - pad.right).clamp(1, 1e18);
    if (count <= 1) return pad.left;
    final t = (idx / (count - 1)).clamp(0.0, 1.0);
    return pad.left + w * t;
  }

  double priceToY(double price) {
    final h = (size.height - pad.top - pad.bottom).clamp(1, 1e18);
    final range = (maxPrice - minPrice).abs().clamp(1e-9, 1e18);
    // maxPrice가 top(0)
    final t = ((maxPrice - price) / range).clamp(0.0, 1.0);
    return pad.top + h * t;
  }
}
