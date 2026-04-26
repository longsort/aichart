import 'core_engine.dart';

class TfMultiResult {
  final Map<String, CoreSnapshot> snaps;
  const TfMultiResult(this.snaps);
}

class TfMultiRunner {
  final CoreEngine _core = CoreEngine();

  TfMultiResult analyzeAll({
    required List<double> prices,
    required List<double> volumes,
  }) {
    // Baseline TF set; actual aggregation windows come later.
    const tfs = <String>['1m', '3m', '5m', '15m', '1h', '4h', '1d', '1w', '1mth'];
    final m = <String, CoreSnapshot>{};
    for (final tf in tfs) {
      m[tf] = _core.analyze(tf: tf, prices: prices, volumes: volumes);
    }
    return TfMultiResult(m);
  }
}
