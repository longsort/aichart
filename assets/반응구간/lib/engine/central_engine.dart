// Safe compatibility layer.
// Some older patches referenced `CentralEngine.boot()`.
// This file keeps the symbol so the project builds even if someone
// accidentally imports it.

import 'package:flutter/foundation.dart';

class CentralEngine {
  static bool _booted = false;

  static final ValueNotifier<bool> booted = ValueNotifier<bool>(false);
  static final ValueNotifier<int> lastUpdateMs = ValueNotifier<int>(0);

  static void boot() {
    if (_booted) return;
    _booted = true;
    booted.value = true;
    lastUpdateMs.value = DateTime.now().millisecondsSinceEpoch;
  }
}
