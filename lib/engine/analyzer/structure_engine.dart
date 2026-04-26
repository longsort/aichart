import '../models/candle.dart';
import '../models/swing_point.dart';
import '../models/struct_event.dart';
import 'swing_detector.dart';

/// StructureEngine ??BOS_UP/BOS_DN, MSB_UP/MSB_DN (breakBuffer 0.10%)
class StructureEngine {
  static const double breakBuffer = 0.0010;

  final SwingDetector _swing = SwingDetector(pivotLen: 2);

  List<StructEvent> run(List<Candle> candles, String tf) {
    if (candles.isEmpty) return [];
    final list = List<Candle>.from(candles)..sort((a, b) => a.t.compareTo(b.t));
    final swings = _swing.detect(list);
    if (swings.isEmpty) return [];

    final events = <StructEvent>[];
    final highs = swings.where((s) => s.isHigh).toList();
    final lows = swings.where((s) => !s.isHigh).toList();
    if (highs.isEmpty || lows.isEmpty) return [];

    final lastClose = list.last.c;
    final lastHigh = highs.last.price;
    final lastLow = lows.last.price;

    if (lastClose >= lastHigh * (1 + breakBuffer)) events.add(StructEvent(type: StructEventType.BOS_UP, t: list.last.t, price: lastClose, tf: tf, score: 70));
    if (lastClose <= lastLow * (1 - breakBuffer)) events.add(StructEvent(type: StructEventType.BOS_DN, t: list.last.t, price: lastClose, tf: tf, score: 70));

    bool wasUp = list.length >= 2 && list[list.length - 2].c < list[list.length - 1].c;
    if (events.any((e) => e.type == StructEventType.BOS_DN) && wasUp) events.add(StructEvent(type: StructEventType.MSB_DN, t: list.last.t, price: lastClose, tf: tf, score: 80));
    if (events.any((e) => e.type == StructEventType.BOS_UP) && !wasUp) events.add(StructEvent(type: StructEventType.MSB_UP, t: list.last.t, price: lastClose, tf: tf, score: 80));

    return events;
  }
}
