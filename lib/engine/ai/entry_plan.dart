import 'dart:math';

class EntryPlan {
  final double entry;
  final double sl;
  final List<double> tps;
  final double rr;

  const EntryPlan({
    required this.entry,
    required this.sl,
    required this.tps,
    required this.rr,
  });
}

/// Simple, safe plan builder (no dynamic lists, no num inference).
EntryPlan buildPlan({
  required double price,
  required String decision, // LONG/SHORT/NO-TRADE
  required int evidenceHit,
  required double atr,
}) {
  final p = price.toDouble();
  final dist = max(atr.toDouble(), p * 0.002); // fallback if atr is tiny

  double entry = p;
  double sl = p;
  List<double> tps = const [];

  final d = decision.toUpperCase();
  if (d == 'LONG') {
    sl = entry - dist;
    final r = entry - sl;
    tps = <double>[entry + r * 1.0, entry + r * 1.6, entry + r * 2.3];
  } else if (d == 'SHORT') {
    sl = entry + dist;
    final r = sl - entry;
    tps = <double>[entry - r * 1.0, entry - r * 1.6, entry - r * 2.3];
  } else {
    // NO-TRADE
    sl = entry;
    tps = const [];
  }

  final denom = (entry - sl).abs();
  final rr = (tps.isEmpty || denom == 0.0) ? 0.0 : ((tps[0] - entry).abs() / denom);

  return EntryPlan(entry: entry, sl: sl, tps: tps, rr: rr);
}