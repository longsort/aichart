import 'core_engine.dart';

dynamic analyzeCompat(
  CoreEngine core, {
  required String tf,
  required List<double> prices,
  required List<double> volumes,
}) {
  final c = core as dynamic;

  final attempts = <Map<Symbol, dynamic>>[
    {#tf: tf, #prices: prices, #volumes: volumes},
    {#tf: tf, #closes: prices, #volumes: volumes},
    {#tf: tf, #series: prices, #volumes: volumes},
    {#tf: tf, #priceSeries: prices, #volumes: volumes},
    {#tf: tf, #tfLabel: tf, #prices: prices, #volumes: volumes},
  ];

  for (final named in attempts) {
    try {
      return Function.apply(c.analyze, const [], named);
    } catch (_) {}
  }

  try {
    return c.analyze(tf, prices, volumes);
  } catch (_) {}
  try {
    return c.analyze(tf, prices);
  } catch (_) {}

  return null;
}