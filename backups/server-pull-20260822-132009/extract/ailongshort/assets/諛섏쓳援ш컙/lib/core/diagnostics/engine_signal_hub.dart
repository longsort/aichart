import 'dart:async';
import 'package:flutter/foundation.dart';

/// "모든 기능이 살아있는지" 한눈에 보기 위한 상태 허브.
///
/// - 각 엔진/데이터 스트림이 업데이트될 때 mark()를 호출.
/// - UI는 이 허브의 ValueNotifier를 구독해서 실시간으로 점등(OK/STALE/ERROR).
class EngineSignal {
  final String key;
  final String name;
  final DateTime? lastAt;
  final String status; // OK/STALE/ERROR/OFF
  final String detail;

  const EngineSignal({
    required this.key,
    required this.name,
    required this.lastAt,
    required this.status,
    required this.detail,
  });
}

class EngineSignalHub {
  static final EngineSignalHub I = EngineSignalHub._();
  EngineSignalHub._();

  final ValueNotifier<List<EngineSignal>> items = ValueNotifier<List<EngineSignal>>([]);

  final Map<String, String> _names = <String, String>{
    'price': '가격',
    'candle': '캔들',
    'analysis': '분석',
    'pattern': '패턴',
    'whale': '고래',
    'orderbook': '호가',
    'notify': '알림',
    'db': '로그/DB',
  };

  final Map<String, DateTime?> _lastAt = <String, DateTime?>{};
  final Map<String, String> _lastDetail = <String, String>{};
  final Map<String, String> _lastErr = <String, String>{};

  Timer? _t;

  void start() {
    if (_t != null) return;
    // 0.5s마다 UI에 "움직임"을 반영
    _t = Timer.periodic(const Duration(milliseconds: 500), (_) => _emit());
    _emit();
  }

  void stop() {
    _t?.cancel();
    _t = null;
  }

  void ensureKey(String key, {String? name}) {
    if (name != null) _names[key] = name;
    _lastAt.putIfAbsent(key, () => null);
    _lastDetail.putIfAbsent(key, () => '');
    _lastErr.putIfAbsent(key, () => '');
    _emit();
  }

  void mark(String key, {String detail = ''}) {
    _lastAt[key] = DateTime.now();
    if (detail.isNotEmpty) _lastDetail[key] = detail;
    _lastErr[key] = '';
    _emit();
  }

  void markError(String key, Object e) {
    _lastAt[key] = DateTime.now();
    _lastErr[key] = e.toString();
    _emit();
  }

  String _statusOf(String key, DateTime? at) {
    if (_lastErr[key] != null && _lastErr[key]!.isNotEmpty) return 'ERROR';
    if (at == null) return 'OFF';
    final age = DateTime.now().difference(at);
    // 스트림별 성격이 달라서 느슨하게 잡음
    final stale = age.inSeconds >= 12;
    return stale ? 'STALE' : 'OK';
  }

  void _emit() {
    final list = <EngineSignal>[];
    for (final key in _names.keys) {
      final at = _lastAt[key];
      final st = _statusOf(key, at);
      final err = _lastErr[key] ?? '';
      final detail = err.isNotEmpty ? err : (_lastDetail[key] ?? '');
      list.add(EngineSignal(
        key: key,
        name: _names[key] ?? key,
        lastAt: at,
        status: st,
        detail: detail,
      ));
    }
    items.value = list;
  }
}
