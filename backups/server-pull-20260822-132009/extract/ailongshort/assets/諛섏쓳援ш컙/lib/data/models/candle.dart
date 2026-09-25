class Candle {
  final DateTime t;
  final double o, h, l, c, v;
  Candle({required this.t, required this.o, required this.h, required this.l, required this.c, required this.v});

  factory Candle.fromJson(Map<String, dynamic> j) => Candle(
    t: DateTime.parse(j['t'] as String),
    o: (j['o'] as num).toDouble(),
    h: (j['h'] as num).toDouble(),
    l: (j['l'] as num).toDouble(),
    c: (j['c'] as num).toDouble(),
    v: (j['v'] as num).toDouble(),
  );
}
