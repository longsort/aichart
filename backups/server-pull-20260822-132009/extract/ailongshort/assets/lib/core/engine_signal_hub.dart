import 'package:flutter/foundation.dart';

class EngineSignal {
  final String key;
  final String name;
  final DateTime? last;
  final String detail;

  const EngineSignal({
    required this.key,
    required this.name,
    required this.last,
    required this.detail,
  });

  EngineSignal copyWith({DateTime? last, String? detail}) => EngineSignal(
        key: key,
        name: name,
        last: last ?? this.last,
        detail: detail ?? this.detail,
      );
}

class EngineSignalHub {
  EngineSignalHub._();
  static final EngineSignalHub I = EngineSignalHub._();

  final ValueNotifier<List<EngineSignal>> signals = ValueNotifier<List<EngineSignal>>([]);

  void ensureKey(String key, {String? name}) {
    final cur = List<EngineSignal>.from(signals.value);
    if (cur.any((e) => e.key == key)) return;
    cur.add(EngineSignal(key: key, name: name ?? key, last: null, detail: ''));
    signals.value = cur;
  }

  void mark(String key, {String detail = ''}) {
    final cur = List<EngineSignal>.from(signals.value);
    final i = cur.indexWhere((e) => e.key == key);
    if (i == -1) return;
    cur[i] = cur[i].copyWith(last: DateTime.now(), detail: detail);
    signals.value = cur;
  }
}
