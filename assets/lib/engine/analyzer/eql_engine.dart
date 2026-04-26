import '../models/candle.dart';
import '../models/swing_point.dart';
import '../models/level_line.dart';
import 'swing_detector.dart';

/// EqlEngine — tolerance 0.08% 클러스터링, 2회 이상이면 EQH/EQL
class EqlEngine {
  static const double tolerance = 0.0008;

  final SwingDetector _swing = SwingDetector(pivotLen: 2);

  List<LevelLine> run(List<Candle> candles, String tf) {
    if (candles.isEmpty) return [];
    final swings = _swing.detect(candles);
    final highs = swings.where((s) => s.isHigh).map((s) => s.price).toList();
    final lows = swings.where((s) => !s.isHigh).map((s) => s.price).toList();

    final lines = <LevelLine>[];
    for (final cluster in _cluster(highs)) {
      if (cluster.length >= 2) {
        final y = cluster.reduce((a, b) => a + b) / cluster.length;
        final ts = swings.where((s) => s.isHigh && (s.price - y).abs() / (y == 0 ? 1 : y) <= tolerance).map((s) => s.t).toList();
        if (ts.length >= 2) lines.add(LevelLine(type: LevelType.EQH, y: y, t0: ts.first, t1: ts.last, score: 60 + ts.length * 5));
      }
    }
    for (final cluster in _cluster(lows)) {
      if (cluster.length >= 2) {
        final y = cluster.reduce((a, b) => a + b) / cluster.length;
        final ts = swings.where((s) => !s.isHigh && (s.price - y).abs() / (y == 0 ? 1 : y) <= tolerance).map((s) => s.t).toList();
        if (ts.length >= 2) lines.add(LevelLine(type: LevelType.EQL, y: y, t0: ts.first, t1: ts.last, score: 60 + ts.length * 5));
      }
    }
    return lines;
  }

  List<List<double>> _cluster(List<double> prices) {
    if (prices.isEmpty) return [];
    final sorted = List<double>.from(prices)..sort();
    final clusters = <List<double>>[];
    var current = <double>[sorted.first];
    for (var i = 1; i < sorted.length; i++) {
      final p = sorted[i];
      if ((p - current.last) / (current.last == 0 ? 1 : current.last) <= tolerance) current.add(p);
      else {
        if (current.length >= 2) clusters.add(List.from(current));
        current = [p];
      }
    }
    if (current.length >= 2) clusters.add(current);
    return clusters;
  }
}
