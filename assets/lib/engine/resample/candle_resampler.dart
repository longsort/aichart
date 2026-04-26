class Candle {
  final DateTime t;
  final double o;
  final double h;
  final double l;
  final double c;
  final double v;

  const Candle(this.t, this.o, this.h, this.l, this.c, this.v);
}

List<Candle> resample(List<Candle> src, Duration bucket) {
  if (src.isEmpty) return const [];
  final out = <Candle>[];
  Candle? cur;
  DateTime? curKey;

  DateTime keyOf(DateTime t) {
    final ms = t.millisecondsSinceEpoch;
    final b = bucket.inMilliseconds;
    final k = (ms ~/ b) * b;
    return DateTime.fromMillisecondsSinceEpoch(k);
  }

  for (final c in src) {
    final k = keyOf(c.t);
    if (cur == null || curKey != k) {
      if (cur != null) out.add(cur);
      curKey = k;
      cur = Candle(k, c.o, c.h, c.l, c.c, c.v);
    } else {
      cur = Candle(
        curKey!,
        cur.o,
        cur.h > c.h ? cur.h : c.h,
        cur.l < c.l ? cur.l : c.l,
        c.c,
        cur.v + c.v,
      );
    }
  }
  if (cur != null) out.add(cur);
  return out;
}