import '../models/fu_state.dart';

/// 1D 캔들을 1W/1M/1Y로 집계.
/// - 입력은 시간 오름차순(ascending) 가정
class FuCandleAggregate {
  static List<FuCandle> toWeek(List<FuCandle> d1) {
    return _group(d1, (c) {
      final dt = DateTime.fromMillisecondsSinceEpoch(c.ts, isUtc: true);
      // ISO week start (Mon)
      final monday = dt.subtract(Duration(days: (dt.weekday - DateTime.monday) % 7));
      final start = DateTime.utc(monday.year, monday.month, monday.day);
      return start.millisecondsSinceEpoch;
    });
  }

  static List<FuCandle> toMonth(List<FuCandle> d1) {
    return _group(d1, (c) {
      final dt = DateTime.fromMillisecondsSinceEpoch(c.ts, isUtc: true);
      final start = DateTime.utc(dt.year, dt.month, 1);
      return start.millisecondsSinceEpoch;
    });
  }

  static List<FuCandle> toYear(List<FuCandle> d1) {
    return _group(d1, (c) {
      final dt = DateTime.fromMillisecondsSinceEpoch(c.ts, isUtc: true);
      final start = DateTime.utc(dt.year, 1, 1);
      return start.millisecondsSinceEpoch;
    });
  }

  static List<FuCandle> _group(List<FuCandle> src, int Function(FuCandle) key) {
    if (src.isEmpty) return const [];
    final out = <FuCandle>[];
    int? curKey;
    FuCandle? cur;

    void flush() {
      if (cur != null) out.add(cur!);
      cur = null;
      curKey = null;
    }

    for (final c in src) {
      final k = key(c);
      if (curKey == null || k != curKey) {
        flush();
        curKey = k;
        cur = FuCandle(
          ts: k,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
          volume: c.volume,
        );
      } else {
        final x = cur!;
        cur = FuCandle(
          ts: x.ts,
          open: x.open,
          high: c.high > x.high ? c.high : x.high,
          low: c.low < x.low ? c.low : x.low,
          close: c.close,
          volume: x.volume + c.volume,
        );
      }
    }
    flush();
    return out;
  }
}
