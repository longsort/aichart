
import 'package:flutter/material.dart';
import 'csv_feed.dart';
import 'state_engine.dart';

class AICsvAutoRun extends ChangeNotifier {
  final CsvFeed _feed = CsvFeed();

  // outputs for UI
  int evidenceCount = 0;
  double confidence = 0.0;
  List<String> reasons = const [];
  MarketState state = MarketState.stable;

  // internal
  double P = 0.5, E = 0.4, V = 0.2, R = 0.2;

  Future<void> start({String assetPath = 'assets/data/sample.csv'}) async {
    final rows = await _feed.load(assetPath);
    final m = _feed.calcPER(rows);

    P = m["P"]!; E = m["E"]!; V = m["V"]!; R = m["R"]!;
    state = computeState(P,E,V,R);

    // evidence rules v1 (0..6)
    final r = <String>[];
    int n = 0;

    if (E >= 0.55) { n++; r.add("에너지↑"); }
    if (V <= 0.35) { n++; r.add("변동성↓"); }
    if (P >= 0.55) { n++; r.add("방향우세"); }
    if (R <= 0.45) { n++; r.add("리스크↓"); }
    if (E >= 0.70) { n++; r.add("거래량↑"); }
    if (state == MarketState.energy) { n++; r.add("폭발준비"); }
    if (state == MarketState.danger) { n++; r.add("위험경보"); }

    evidenceCount = n.clamp(0, 6);
    reasons = r.take(3).toList();

    // confidence = 증거 기반 + 상태 보정
    double c = (evidenceCount / 6.0);
    if (state == MarketState.energy) c += 0.08;
    if (state == MarketState.uncertain) c -= 0.06;
    if (state == MarketState.danger) c -= 0.12;
    confidence = c.clamp(0.05, 0.95);

    notifyListeners();
  }
}
