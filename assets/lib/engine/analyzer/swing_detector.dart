import '../models/candle.dart';
import '../models/swing_point.dart';

/// SwingDetector — pivotLen=2 기준 스윕 고/저점
class SwingDetector {
  final int pivotLen;

  SwingDetector({this.pivotLen = 2});

  List<SwingPoint> detect(List<Candle> candles) {
    if (candles.length < pivotLen * 2 + 1) return [];
    final list = List<Candle>.from(candles)..sort((a, b) => a.t.compareTo(b.t));
    final points = <SwingPoint>[];

    for (var i = pivotLen; i < list.length - pivotLen; i++) {
      final c = list[i];
      bool isHigh = true;
      for (var j = 1; j <= pivotLen; j++) {
        if (list[i - j].h >= c.h || list[i + j].h >= c.h) isHigh = false;
      }
      if (isHigh) points.add(SwingPoint(t: c.t, price: c.h, isHigh: true));

      bool isLow = true;
      for (var j = 1; j <= pivotLen; j++) {
        if (list[i - j].l <= c.l || list[i + j].l <= c.l) isLow = false;
      }
      if (isLow) points.add(SwingPoint(t: c.t, price: c.l, isHigh: false));
    }
    return points;
  }
}
