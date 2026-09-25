
import 'dart:math';

class Scenario {
  final String id;   // A/B/C
  final String name; // CN/KR short
  final double p;    // probability 0..1
  const Scenario(this.id, this.name, this.p);
}

class FutureCore {
  // Input: P/E/V/R (0..1). Output: 3 scenarios sum to 1.
  List<Scenario> predict(double P, double E, double V, double R) {
    // Simple v1 heuristic (replace later with stats/ML)
    // A: pullback then up
    double a = (P * 0.45) + (E * 0.25) + ((1 - V) * 0.20) + ((1 - R) * 0.10);
    // B: sideways
    double b = (V * 0.35) + (0.25) + ((1 - (P - 0.5).abs()*2) * 0.40);
    // C: breakdown
    double c = ((1 - P) * 0.45) + (V * 0.25) + (R * 0.30);

    a = max(0.0001, a);
    b = max(0.0001, b);
    c = max(0.0001, c);

    final s = a + b + c;
    a /= s; b /= s; c /= s;

    return const [
      // names are CN/KR for China-ready UI
    ];
  }

  List<Scenario> predictCN(double P, double E, double V, double R) {
    final probs = _predictRaw(P,E,V,R);
    return [
      Scenario("A", "回踩上行/눌림상승", probs[0]),
      Scenario("B", "横盘消耗/횡보", probs[1]),
      Scenario("C", "趋势破坏/붕괴", probs[2]),
    ];
  }

  List<double> _predictRaw(double P, double E, double V, double R) {
    double a = (P * 0.45) + (E * 0.25) + ((1 - V) * 0.20) + ((1 - R) * 0.10);
    double b = (V * 0.35) + (0.25) + ((1 - (P - 0.5).abs()*2) * 0.40);
    double c = ((1 - P) * 0.45) + (V * 0.25) + (R * 0.30);
    a = max(0.0001, a);
    b = max(0.0001, b);
    c = max(0.0001, c);
    final s = a + b + c;
    return [a/s, b/s, c/s];
  }
}
