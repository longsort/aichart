import 'package:flutter/foundation.dart';
import 'engine_bridge.dart';

class SymbolController {
  SymbolController._();
  static final SymbolController I = SymbolController._();

  final ValueNotifier<String> symbol = ValueNotifier<String>('BTCUSDT');

  void set(String s) {
    if (s == symbol.value) return;
    symbol.value = s;
    EngineBridge.I.start(symbol: s);
  }
}
