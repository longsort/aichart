import '../learning/evidence_weight_store.dart';

class EvidenceItem {
  final String key;
  final bool ok;
  const EvidenceItem(this.key, this.ok);
}

class EvidenceResult {
  /// Scaled 0~10 (weighted)
  final int hit;
  final int total; // always 10
  final Map<String, bool> flags;

  const EvidenceResult({
    required this.hit,
    required this.total,
    required this.flags,
  });

  List<EvidenceItem> get items =>
      flags.entries.map((e) => EvidenceItem(e.key, e.value)).toList(growable: false);
}

class EvidenceEngine {
  static Map<String, double> _weights = <String, double>{};
  static bool _loading = false;

  EvidenceEngine() {
    _warmup();
  }

  void _warmup() {
    if (_loading) return;
    _loading = true;
    EvidenceWeightStore.I.load().then((w) {
      _weights = w;
    }).catchError((_) {}).whenComplete(() {
      _loading = false;
    });
  }

  double _w(String key) => (_weights[key] ?? 1.0);

  EvidenceResult evaluate({
    required double up15,
    required double up1h,
    required double up4h,
    required String whaleGrade,
    required int whaleStreak,
    required double risk01, // 0.0~1.0
    required double momentum, // -1~+1 approx
    required double volSpike01, // 0~1

    // v96: optional true multiTF consensus
    double? consensus01, // 0~1
    Map<String, int>? tfUp, // TF => UP%
  }) {
    final flags = <String, bool>{};

    final avgUp = (up15 + up1h + up4h) / 3.0;
    final cons = consensus01 ?? (avgUp / 100.0);

    // 10 evidence keys (stable names)
    flags['trendAlign'] = (up15 >= 55 && up1h >= 52) || (up15 >= 52 && up4h >= 55);

    flags['tfConsensus'] = cons >= 0.56;

    flags['whaleGrade'] = (whaleGrade == 'HIGH' || whaleGrade == 'TOP') || whaleStreak >= 2;

    flags['volSpike'] = volSpike01 >= 0.70;

    flags['riskOk'] = (risk01 * 100) <= 70;

    flags['momentumPos'] = momentum >= 0.02;

    // structure proxy
    flags['breakoutBias'] = up15 >= 58 || up15 <= 42;

    // FVG/BPR proxy
    flags['fvgBpr'] = volSpike01 >= 0.60 && (avgUp >= 55 || avgUp <= 45);

    // orderbook/liquidity proxy
    flags['liquidity'] = whaleStreak >= 1;

    // AI feedback proxy (placeholder)
    flags['aiFeedback'] = true;

    // --- weighted hit: scale to 0~10 ---
    double totalW = 0;
    double hitW = 0;
    for (final e in flags.entries) {
      final w = _w(e.key);
      totalW += w;
      if (e.value) hitW += w;
    }
    final ratio = totalW <= 0 ? 0.0 : (hitW / totalW);
    final hitScaled = (ratio * 10.0).round().clamp(0, 10);

    return EvidenceResult(hit: hitScaled, total: 10, flags: flags);
  }

  Map<String, dynamic> decide({
    required EvidenceResult ev,
    required int up15,
    required int risk,
    int? consensusPct, // v96 optional
  }) {
    final hit = ev.hit;
    final consOk = (consensusPct ?? 56) >= 56;

    String decision = 'NO-TRADE';

    if (hit >= 7 && consOk && up15 >= 55 && risk <= 70) decision = 'LONG';
    if (hit >= 7 && consOk && up15 <= 45 && risk <= 70) decision = 'SHORT';

    int confidence = (hit * 10 + (up15 - 50).abs()).clamp(0, 100);
    if (decision == 'NO-TRADE') confidence = (hit * 8).clamp(0, 80);

    return {'decision': decision, 'confidence': confidence};
  }
}