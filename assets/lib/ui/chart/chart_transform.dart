import 'dart:ui';

/// PHASE D — 좌표 계산 단일화. Painter는 계산 없이 transform만 사용.
class ChartTransform {
  final Rect plotRect;
  final double minPrice;
  final double maxPrice;
  final int startTime;
  final int endTime;

  ChartTransform({
    required this.plotRect,
    required this.minPrice,
    required this.maxPrice,
    required this.startTime,
    required this.endTime,
  });

  double get _priceRange => (maxPrice - minPrice).clamp(1e-9, double.infinity).toDouble();
  double get _timeRange => (endTime - startTime).clamp(1, double.infinity).toDouble();

  double priceToY(double price) {
    final t = (price - minPrice) / _priceRange;
    return plotRect.bottom - t * plotRect.height;
  }

  double timeToX(int timeMs) {
    final t = (timeMs - startTime) / _timeRange;
    return plotRect.left + t * plotRect.width;
  }

  /// S-02: tapX -> 가장 가까운 시간(ms). 좌표 계산 단일화.
  int xToTime(double x) {
    final t = ((x - plotRect.left) / plotRect.width).clamp(0.0, 1.0);
    return (startTime + t * _timeRange).round();
  }
}
