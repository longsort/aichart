import 'package:flutter/foundation.dart';

class AiOpenPosition {
  final String symbol;
  final String tf;
  final double entry;
  final double stop;
  final double target;
  final DateTime openedAt;

  const AiOpenPosition({
    required this.symbol,
    required this.tf,
    required this.entry,
    required this.stop,
    required this.target,
    required this.openedAt,
  });
}

class AiOpenPositionStore {
  static final ValueNotifier<AiOpenPosition?> open = ValueNotifier<AiOpenPosition?>(null);

  static void set(AiOpenPosition p) => open.value = p;
  static void clear() => open.value = null;
}
