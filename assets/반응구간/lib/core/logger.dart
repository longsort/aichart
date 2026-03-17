import 'package:flutter/foundation.dart';

/// 단순 로거 (디버그/에러)
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
