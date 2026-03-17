import 'dart:collection';

class CentralEvidenceHub {
  static final Map<String, double> _evidence = HashMap();
  static final ValueNotifier<Map<String, double>> notifier =
      ValueNotifier({});

  static void push(String key, double value) {
    _evidence[key] = value;
    notifier.value = Map.from(_evidence);
  }

  static int get count => _evidence.length;
  static double get score =>
      _evidence.values.fold(0.0, (a, b) => a + b) / (_evidence.length == 0 ? 1 : _evidence.length);
}
