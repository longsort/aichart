
import 'dart:async';

/// PATCH-7: Simple watchdog to keep WS alive and expose status.
class WsGuard {
  DateTime _lastTick = DateTime.fromMillisecondsSinceEpoch(0);
  Timer? _timer;

  bool get isStale => DateTime.now().difference(_lastTick).inSeconds > 8;

  void tick() {
    _lastTick = DateTime.now();
  }

  void start(void Function() onStale) {
    _timer?.cancel();
    _timer = Timer.periodic(const Duration(seconds: 3), (_) {
      if (isStale) onStale();
    });
  }

  void stop() => _timer?.cancel();
}
