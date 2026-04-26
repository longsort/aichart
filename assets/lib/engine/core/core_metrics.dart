import 'dart:math';

class CoreMetrics {
  final double up15;
  final double up1h;
  final double up4h;
  final double risk01;
  final double momentum;
  final double volSpike01;

  const CoreMetrics({
    required this.up15,
    required this.up1h,
    required this.up4h,
    required this.risk01,
    required this.momentum,
    required this.volSpike01,
  });

  static double _sma(List<double> xs) {
    if (xs.isEmpty) return 0;
    double s = 0;
    for (final v in xs) s += v;
    return s / xs.length;
  }

  static double _std(List<double> xs, double mean) {
    if (xs.length < 2) return 0;
    double s = 0;
    for (final v in xs) {
      final d = v - mean;
      s += d * d;
    }
    return sqrt(s / (xs.length - 1));
  }

  static List<double> _tail(List<double> xs, int n) {
    if (xs.isEmpty) return const [];
    if (xs.length <= n) return List<double>.from(xs);
    return xs.sublist(xs.length - n);
  }

  static double _clamp(double x, double a, double b) => x < a ? a : (x > b ? b : x);

  /// Convert 0~1 confidence into 0~100 probability
  static double _p(double x01) => _clamp(x01, 0, 1) * 100.0;

  /// Build metrics from ring buffers in BitgetLiveStore.
  /// Note: store.prices is 2s ticks (not true candles). We still derive:
  /// - momentum: (last - sma)/sma
  /// - risk01: normalized volatility (std / mean) scaled
  /// - volSpike01: normalized 24h quote-volume spike (delta vs sma)
  static CoreMetrics fromRings({
    required List<double> prices,
    required List<double> vols,
  }) {
    final p = _tail(prices, 120); // ~4 minutes if 2s interval
    final v = _tail(vols, 120);

    if (p.length < 5) {
      return const CoreMetrics(
        up15: 50,
        up1h: 50,
        up4h: 50,
        risk01: 0.50,
        momentum: 0.0,
        volSpike01: 0.50,
      );
    }

    final last = p.last;
    final mean = _sma(_tail(p, 40));
    final std = _std(_tail(p, 40), mean);

    final mom = mean == 0 ? 0.0 : (last - mean) / mean; // about -0.02~0.02 typical
    // volatility ratio -> risk01
    final volRatio = mean == 0 ? 0.0 : (std / mean);
    final risk01 = _clamp(volRatio * 12.0, 0.0, 1.0); // scaled

    // volume spike
    final vMean = _sma(_tail(v, 40));
    final vLast = v.isEmpty ? 0.0 : v.last;
    double spike = 0.0;
    if (vMean > 0) spike = (vLast - vMean) / vMean;
    final volSpike01 = _clamp(0.5 + spike * 0.25, 0.0, 1.0);

    // probabilities: based on momentum and risk
    // more momentum -> higher up prob, more risk -> reduce
    double base = 0.5 + mom * 6.0; // mom 0.01 => +0.06
    base = base - (risk01 - 0.5) * 0.25;

    final up15 = _p(_clamp(base, 0.0, 1.0));
    final up1h = _p(_clamp(0.5 + mom * 4.0 - (risk01 - 0.5) * 0.20, 0.0, 1.0));
    final up4h = _p(_clamp(0.5 + mom * 2.5 - (risk01 - 0.5) * 0.15, 0.0, 1.0));

    return CoreMetrics(
      up15: up15,
      up1h: up1h,
      up4h: up4h,
      risk01: risk01,
      momentum: mom,
      volSpike01: volSpike01,
    );
  }
}