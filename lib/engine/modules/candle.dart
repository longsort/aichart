
class Candle {
  final int t;      // ms
  final double o;
  final double h;
  final double l;
  final double c;
  final double? v;

  Candle({required this.t, required this.o, required this.h, required this.l, required this.c, this.v});

  static Candle fromMap(Map<String, dynamic> m) {
    double d(v) => (v is int) ? v.toDouble() : (v as num).toDouble();
    return Candle(
      t: (m['t'] as num).toInt(),
      o: d(m['o']),
      h: d(m['h']),
      l: d(m['l']),
      c: d(m['c']),
      v: m['v'] == null ? null : d(m['v']),
    );
  }
}
