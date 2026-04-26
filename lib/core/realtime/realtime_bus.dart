import 'dart:async';
import '../../data/models/candle.dart';
import '../../data/repository/realtime_candle_repo.dart';

class RealtimeBus {
  final RealtimeCandleRepo repo;
  final String symbol;
  final String tf;
  final int limit;
  final Duration interval;

  final _ctrl = StreamController<List<Candle>>.broadcast();
  Timer? _timer;
  bool _running = false;

  Stream<List<Candle>> get stream => _ctrl.stream;

  RealtimeBus({
    required this.repo,
    required this.symbol,
    required this.tf,
    this.limit = 120,
    this.interval = const Duration(seconds: 2),
  });

  Future<void> start() async {
    if (_running) return;
    _running = true;

    // 즉시 1??    await _tick();

    _timer = Timer.periodic(interval, (_) async {
      await _tick();
    });
  }

  Future<void> _tick() async {
    try {
      final candles = await repo.fetch(symbol: symbol, tf: tf, limit: limit);
      if (!_ctrl.isClosed) _ctrl.add(candles);
    } catch (_) {
      // 조용??무시 (UI ?��? 방�?)
    }
  }

  void stop() {
    _running = false;
    _timer?.cancel();
    _timer = null;
  }

  void dispose() {
    stop();
    _ctrl.close();
  }
}
