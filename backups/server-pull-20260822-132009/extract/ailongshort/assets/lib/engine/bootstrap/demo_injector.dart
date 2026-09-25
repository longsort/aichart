import 'dart:math';

import 'package:flutter/foundation.dart';

/// Demo-only injector.
///
/// ✅ 목적: 실데이터(Bitget/Websocket) 연결 전에도 UI가 죽지 않고
///    게이지/숫자가 "움직이는 것처럼" 보이게 하는 더미 값 공급.
///
/// ⚠️ 실전에서는 `BitgetLiveStore`가 실제 값을 밀어넣으면
///    이 데모 값은 자연스럽게 의미가 없어집니다.
class DemoInjector {
  static bool _ready = false;
  static final _rng = Random();

  /// Backward-compatible bootstrap entry.
  /// (기존 코드에서 `DemoInjector.setup()`을 호출하는 경우 대응)
  static Future<void> setup() async {
    await installDemoIfNeeded();
  }

  /// Install demo mode once.
  static Future<void> installDemoIfNeeded() async {
    if (_ready) return;
    _ready = true;
    debugPrint('[DEMO] injector ready');
  }

  /// Optional demo tick hook.
  /// bootstrap에서 주기적으로 호출해도 안전합니다.
  static void tick() {
    // no-op. (필요하면 여기에 전역 데모 카운터를 올리면 됨)
  }

  /// Small helper for demo percentages.
  static double wobble(double base, {double amp = 0.08}) {
    final v = base + (_rng.nextDouble() * 2 - 1) * amp;
    return v.clamp(0.0, 1.0);
  }
}
