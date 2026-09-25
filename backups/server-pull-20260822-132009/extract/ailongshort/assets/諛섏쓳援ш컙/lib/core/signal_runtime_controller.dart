import 'dart:async';
import 'package:flutter/foundation.dart';

import 'app_core.dart';
import '../data/snapshot/engine_snapshot.dart';
import '../data/signal_log_store.dart';
import 'trade_guard.dart';
import 'app_settings.dart';
import '../engine/central/decision_logger.dart';

/// 런타임 컨트롤러
/// - AppCore 스냅샷을 구독
/// - "가능" 상태에서 롱/숏이 바뀌면 자동 로그 기록
/// - 화면에서는 ValueNotifier를 구독해서 스낵바/배너로 표시 가능(플러그인 필요 없음)
class SignalRuntimeController {
  SignalRuntimeController._();
  static final SignalRuntimeController I = SignalRuntimeController._();

  StreamSubscription<EngineSnapshot>? _sub;

  final ValueNotifier<String?> banner = ValueNotifier<String?>(null);

  String _lastKey = '';
  int _cooldownUntilMs = 0;

  bool get inCooldown => DateTime.now().millisecondsSinceEpoch < _cooldownUntilMs;

  void start() {
    _sub ??= AppCore.I.stream.listen(_onSnap);
  }

  void dispose() {
    _sub?.cancel();
    _sub = null;
    banner.dispose();
  }

  void _onSnap(EngineSnapshot s) {
    final now = DateTime.now().millisecondsSinceEpoch;
    if (now < _cooldownUntilMs) return;

    // 안전장치 통과해야만 신호 확정
    if (!TradeGuard.I.allowSignal(s)) {
      // 상태 배너만 갱신
      banner.value = '상태: ' + TradeGuard.I.statusText();
      return;
    }


    final dir = s.bias > 0.10 ? '롱' : (s.bias < -0.10 ? '숏' : '중립');
    if (dir == '중립') return;

    // 같은 신호 반복 로그 방지(15초)
    final key = '$dir:${(s.confidence*100).round()}:${(s.consensus*100).round()}';
    if (_lastKey == key) return;
    _lastKey = key;

    // 자동 기록
    if (AppSettings.I.enableAutoLog.value) {
      SignalLogStore.I.add(
      SignalLogEntry(
        ts: DateTime.now(),
        symbol: 'BTCUSDT',
        decision: '$dir 신호',
        reason: '합의 ${(s.consensus*100).round()}% / 신뢰 ${(s.confidence*100).round()}%',
      ),
    );

    // 화면 배너(앱 내부 알림)
    if (AppSettings.I.enableSystemNotify.value) {
      banner.value = '$dir 신호 감지 • 합의 ${(s.consensus*100).round()}% • 신뢰 ${(s.confidence*100).round()}%';
    }
  }

  /// 수동 쿨다운(초보 안전장치)
  void setCooldownMinutes(int minutes) {
    final now = DateTime.now().millisecondsSinceEpoch;
    _cooldownUntilMs = now + minutes * 60 * 1000;
    banner.value = '잠깐 쉬기(쿨다운) ${minutes}분';
  }
}
