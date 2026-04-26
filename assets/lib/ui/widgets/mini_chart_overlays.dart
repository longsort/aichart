import 'package:flutter/material.dart';

/// 구간(박스) 오버레이: 지지/저항/FVG/BPR 등을 같은 형태로 표현
class ZoneOverlay {
  final double top;
  final double bottom;
  final Color color;
  final String label;
  final double opacity;
  const ZoneOverlay({
    required this.top,
    required this.bottom,
    required this.color,
    this.label = '',
    this.opacity = 0.18,
  });
}

/// 라인 오버레이: 추세선/채널/레벨/VWAP 등
class LineOverlay {
  final double y;
  final Color color;
  final String label;
  final double width;
  const LineOverlay({
    required this.y,
    required this.color,
    this.label = '',
    this.width = 1.2,
  });
}
