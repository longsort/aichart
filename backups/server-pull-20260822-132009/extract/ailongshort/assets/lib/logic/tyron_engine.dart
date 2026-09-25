import '../models/candle.dart';

class TyronStats {
  final bool isBigBull;
  final bool isBigBear;
  final double atr;
  final double body;
  final double bodyAtrRatio;

  final double pUp1;
  final double pUp3;
  final double pUp5;

  final int samples;

  const TyronStats({
    required this.isBigBull,
    required this.isBigBear,
    required this.atr,
    required this.body,
    required this.bodyAtrRatio,
    required this.pUp1,
    required this.pUp3,
    required this.pUp5,
    required this.samples,
  });
}

class TyronEngine {
  /// 타이롱(초보용): 장대양봉/장대음봉 기반의 단기 방향 확률
  /// - big candle: |close-open| >= bigBodyAtr * ATR(14)
  /// - 확률: 과거 big candle 발생 시 다음 1/3/5봉이 상승으로 끝날 확률(종가 기준)
  static TyronStats analyze(List<Candle> candles, {double bigBodyAtr = 1.2}) {
    if (candles.length < 40) {
      return const TyronStats(
        isBigBull: false,
        isBigBear: false,
        atr: 0,
        body: 0,
        bodyAtrRatio: 0,
        pUp1: 0.5,
        pUp3: 0.5,
        pUp5: 0.5,
        samples: 0,
      );
    }

    final atr = _atr14(candles);
    final last = candles.last;
    final body = (last.close - last.open).abs();
    final ratio = atr <= 0 ? 0.0 : body / atr;

    final isBig = atr > 0 && body >= bigBodyAtr * atr;
    final isBull = last.close > last.open;
    final isBear = last.close < last.open;

    final isBigBull = isBig && isBull;
    final isBigBear = isBig && isBear;

    // 과거 샘플링
    int samples = 0;
    int up1 = 0, up3 = 0, up5 = 0;

    // 최소 5봉 뒤까지 확인 가능해야 함
    for (int i = 20; i < candles.length - 6; i++) {
      final c = candles[i];
      final b = (c.close - c.open).abs();
      final a = _atrAt(candles, i);
      if (a <= 0) continue;
      final big = b >= bigBodyAtr * a;
      if (!big) continue;

      samples++;

      // 다음 1/3/5봉 종가가 기준 종가보다 높으면 "상승"
      if (candles[i + 1].close > c.close) up1++;
      if (candles[i + 3].close > c.close) up3++;
      if (candles[i + 5].close > c.close) up5++;
    }

    double p(int up) => samples == 0 ? 0.5 : up.toDouble() / samples.toDouble();

    return TyronStats(
      isBigBull: isBigBull,
      isBigBear: isBigBear,
      atr: atr,
      body: body,
      bodyAtrRatio: ratio,
      pUp1: p(up1),
      pUp3: p(up3),
      pUp5: p(up5),
      samples: samples,
    );
  }

  static double _atr14(List<Candle> candles) => _atrAt(candles, candles.length - 1);

  static double _atrAt(List<Candle> candles, int idx, {int period = 14}) {
    final start = (idx - period + 1).clamp(1, idx);
    double sum = 0;
    int n = 0;
    for (int i = start; i <= idx; i++) {
      final c = candles[i];
      final prevClose = candles[i - 1].close;
      final tr = _trueRange(c.high, c.low, prevClose);
      sum += tr;
      n++;
    }
    return n == 0 ? 0 : sum / n;
  }

  static double _trueRange(double high, double low, double prevClose) {
    final a = high - low;
    final b = (high - prevClose).abs();
    final c = (low - prevClose).abs();
    return [a, b, c].reduce((x, y) => x > y ? x : y);
  }
}