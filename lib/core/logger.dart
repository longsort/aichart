import 'package:flutter/foundation.dart';

/// ?®Ïàú Î°úÍ±∞ (?îÎ≤ÑÍ∑??êÎü¨)
void log(String msg) {
  if (kDebugMode) {
    // ignore: avoid_print
    print('[FulinkPro] $msg');
  }
}

void logError(String msg, [Object? e]) {
  if (kDebugMode) {
    // ignore: avoid_print
    print('[FulinkPro ERROR] $msg ${e != null ? e.toString() : ''}');
  }
}
