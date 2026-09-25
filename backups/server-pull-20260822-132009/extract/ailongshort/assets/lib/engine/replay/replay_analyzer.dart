import '../../core/models/fu_candle.dart';

class ReplayResult {
  final String dir; // LONG/SHORT/WATCH
  final int confidence;
  final int breakoutScore;
  final double reactLow;
  final double reactHigh;
  final double breakLevel;
  final double entry;
  final double stop;
  final double target;
  final double rr;
  final String structureTag;
  const ReplayResult({
    required this.dir,
    required this.confidence,
    required this.breakoutScore,
    required this.reactLow,
    required this.reactHigh,
    required this.breakLevel,
    required this.entry,
    required this.stop,
    required this.target,
    required this.rr,
    required this.structureTag,
  });
}

class ReplayAnalyzer {
  static ReplayResult analyze(List<FuCandle> candles) {
    if (candles.length < 60) {
      final p = candles.isEmpty ? 0.0 : candles.last.close;
      return ReplayResult(
        dir: 'WATCH',
        confidence: 20,
        breakoutScore: 20,
        reactLow: p,
        reactHigh: p,
        breakLevel: p,
        entry: p,
        stop: p,
        target: p,
        rr: 0.5,
        structureTag: 'NONE',
      );
    }

    double sma(int n) {
      final start = candles.length - n;
      double s = 0;
      for (int i = start; i < candles.length; i++) {
        s += candles[i].close;
      }
      return s / n;
    }

    final price = candles.last.close;
    final sma20 = sma(20);
    final sma50 = sma(50);

    String dir;
    if (price > sma50) {
      dir = 'LONG';
    } else if (price < sma50) {
      dir = 'SHORT';
    } else {
      dir = 'WATCH';
    }

    // 최근 40캔들 범위로 반응구간(지지/저항) 계산
    final look = 40;
    double minL = candles[candles.length - look].low;
    double maxH = candles[candles.length - look].high;
    for (int i = candles.length - look; i < candles.length; i++) {
      if (candles[i].low < minL) minL = candles[i].low;
      if (candles[i].high > maxH) maxH = candles[i].high;
    }

    // breakLevel: dir에 따라 최근 스윙 고/저
    final swing = 30;
    double sw = dir == 'SHORT' ? candles[candles.length - swing].low : candles[candles.length - swing].high;
    for (int i = candles.length - swing; i < candles.length; i++) {
      if (dir == 'SHORT') {
        if (candles[i].low < sw) sw = candles[i].low;
      } else {
        if (candles[i].high > sw) sw = candles[i].high;
      }
    }
    double breakLevel = sw;

    // 간단 breakoutScore: (|price-sma20| / price) 기반
    final dist = ((price - sma20).abs() / price) * 100.0;
    int breakoutScore = (20 + dist * 25).round().clamp(10, 95);

    // confidence: 방향 + dist + 최근 변동성(ATR 근사)
    double atr = 0;
    for (int i = candles.length - 14; i < candles.length; i++) {
      atr += (candles[i].high - candles[i].low).abs();
    }
    atr = atr / 14;
    final vol = (atr / price) * 100.0;
    int conf = (30 + dist * 30 + (vol < 0.8 ? 15 : 0)).round().clamp(10, 92);

    // 플랜
    double entry = price;
    double reactLow = minL;
    double reactHigh = maxH;

    double stop, target;
    String tag = 'NONE';

    if (dir == 'LONG') {
      target = reactHigh;
      stop = reactLow;
      tag = 'BOS_UP';
    } else if (dir == 'SHORT') {
      target = reactLow;
      stop = reactHigh;
      tag = 'BOS_DN';
    } else {
      target = reactHigh;
      stop = reactLow;
    }

    final risk = (entry - stop).abs();
    final reward = (target - entry).abs();
    final rr = risk <= 0 ? 0.5 : (reward / risk);

    return ReplayResult(
      dir: dir,
      confidence: conf,
      breakoutScore: breakoutScore,
      reactLow: reactLow,
      reactHigh: reactHigh,
      breakLevel: breakLevel,
      entry: entry,
      stop: stop,
      target: target,
      rr: rr,
      structureTag: tag,
    );
  }
}
