import 'dart:async';
import 'package:flutter/foundation.dart';

/// "ëª¨ë“  ê¸°ëŠ¥???´ì•„?ˆëŠ”ì§€" ?œëˆˆ??ë³´ê¸° ?„í•œ ?íƒœ ?ˆë¸Œ.
///
/// - ê°??”ì§„/?°ì´???¤íŠ¸ë¦¼ì´ ?…ë°?´íŠ¸????mark()ë¥??¸ì¶œ.
/// - UI?????ˆë¸Œ??ValueNotifierë¥?êµ¬ë…?´ì„œ ?¤ì‹œê°„ìœ¼ë¡??ë“±(OK/STALE/ERROR).
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
    'price': 'ê°€ê²?,
    'candle': 'ìº”ë“¤',
    'analysis': 'ë¶„ì„',
    'pattern': '?¨í„´',
    'whale': 'ê³ ë˜',
    'orderbook': '?¸ê?',
    'notify': '?Œë¦¼',
    'db': 'ë¡œê·¸/DB',
  };

  final Map<String, DateTime?> _lastAt = <String, DateTime?>{};
  final Map<String, String> _lastDetail = <String, String>{};
  final Map<String, String> _lastErr = <String, String>{};

  Timer? _t;

  void start() {
    if (_t != null) return;
    // 0.5së§ˆë‹¤ UI??"?€ì§ì„"??ë°˜ì˜
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
    // ?¤íŠ¸ë¦¼ë³„ ?±ê²©???¬ë¼???ìŠ¨?˜ê²Œ ?¡ìŒ
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
