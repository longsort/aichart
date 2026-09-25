import '../models/fu_state.dart';

/// BOS / CHOCH / MSB — 웹 `lib/smcDeskOverlay.ts` 의 `structureMarksFu` 와 동일 규칙(종가 돌파·스윙 L).
/// 규격 변경 시 양쪽을 함께 수정할 것.

class StructureMarkFu {
  final int index;
  final double price;
  final String tag; // BOS/CHOCH/MSB/EQH/EQL
  final bool isBull;
  const StructureMarkFu({
    required this.index,
    required this.price,
    required this.tag,
    required this.isBull,
  });
}

class StructureMarksEngineFu {
  static List<StructureMarkFu> build(
    List<FuCandle> candles, {
    int swingLeftRight = 2,
    int maxMarks = 10,
  }) {
    final n = candles.length;
    if (n < (swingLeftRight * 2 + 5)) return const [];

    double lo = candles.first.low, hi = candles.first.high;
    for (final c in candles) {
      if (c.low < lo) lo = c.low;
      if (c.high > hi) hi = c.high;
    }
    final span = (hi - lo).abs();
    final tol = (span * 0.002).clamp(hi * 0.0006, hi * 0.003);

    int? lastHighIdx;
    double? lastHigh;
    int? lastLowIdx;
    double? lastLow;

    double? prevHigh;
    double? prevLow;

    int trend = 0;
    bool pendingFlip = false;

    final marks = <StructureMarkFu>[];

    bool isSwingHigh(int i) {
      final p = candles[i].high;
      for (int k = 1; k <= swingLeftRight; k++) {
        if (candles[i - k].high >= p) return false;
        if (candles[i + k].high > p) return false;
      }
      return true;
    }

    bool isSwingLow(int i) {
      final p = candles[i].low;
      for (int k = 1; k <= swingLeftRight; k++) {
        if (candles[i - k].low <= p) return false;
        if (candles[i + k].low < p) return false;
      }
      return true;
    }

    for (int i = swingLeftRight; i < n - swingLeftRight; i++) {
      if (isSwingHigh(i)) {
        lastHighIdx = i;
        lastHigh = candles[i].high;
        if (prevHigh != null && (candles[i].high - prevHigh!).abs() <= tol) {
          marks.add(StructureMarkFu(index: i, price: candles[i].high, tag: 'EQH', isBull: false));
        }
        prevHigh = candles[i].high;
      }

      if (isSwingLow(i)) {
        lastLowIdx = i;
        lastLow = candles[i].low;
        if (prevLow != null && (candles[i].low - prevLow!).abs() <= tol) {
          marks.add(StructureMarkFu(index: i, price: candles[i].low, tag: 'EQL', isBull: true));
        }
        prevLow = candles[i].low;
      }

      final close = candles[i].close;

      if (lastHighIdx != null && lastHigh != null && i > lastHighIdx!) {
        if (close > lastHigh!) {
          if (trend >= 0) {
            marks.add(StructureMarkFu(index: i, price: lastHigh!, tag: pendingFlip ? 'MSB' : 'BOS', isBull: true));
            trend = 1;
            pendingFlip = false;
          } else {
            marks.add(StructureMarkFu(index: i, price: lastHigh!, tag: 'CHOCH', isBull: true));
            trend = 1;
            pendingFlip = true;
          }
          lastHighIdx = null;
          lastHigh = null;
        }
      }

      if (lastLowIdx != null && lastLow != null && i > lastLowIdx!) {
        if (close < lastLow!) {
          if (trend <= 0) {
            marks.add(StructureMarkFu(index: i, price: lastLow!, tag: pendingFlip ? 'MSB' : 'BOS', isBull: false));
            trend = -1;
            pendingFlip = false;
          } else {
            marks.add(StructureMarkFu(index: i, price: lastLow!, tag: 'CHOCH', isBull: false));
            trend = -1;
            pendingFlip = true;
          }
          lastLowIdx = null;
          lastLow = null;
        }
      }
    }

    if (marks.isEmpty) return const [];
    marks.sort((a, b) => a.index.compareTo(b.index));
    final trimmed = marks.length > maxMarks ? marks.sublist(marks.length - maxMarks) : marks;
    return List<StructureMarkFu>.unmodifiable(trimmed);
  }
}