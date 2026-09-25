import 'dart:math';

/// SAFE demo feed to wire CORE without touching exchange APIs yet.
/// Produces pseudo price/volume series and a 24h change estimate.
class CoreDemoFeed {
  final _rnd = Random();
  final List<double> prices = <double>[];
  final List<double> volumes = <double>[];

  double _base = 100000.0;
  double chg24h = 0.0;

  void step() {
    if (prices.isEmpty) {
      for (int i = 0; i < 120; i++) {
        prices.add(_base + sin(i / 8) * 120 + _rnd.nextDouble() * 20);
        volumes.add(50000 + _rnd.nextDouble() * 20000);
      }
    } else {
      final last = prices.last;
      final drift = (sin(DateTime.now().millisecond / 180) * 25);
      final next = last + drift + (_rnd.nextDouble() - 0.5) * 30;
      prices.add(next);
      volumes.add(40000 + _rnd.nextDouble() * 30000);

      if (prices.length > 240) {
        prices.removeAt(0);
        volumes.removeAt(0);
      }
    }

    // crude "24h change" from first vs last in buffer
    final first = prices.first;
    final last = prices.last;
    chg24h = ((last - first) / (first == 0 ? 1 : first)) * 100;
  }
}