import 'dart:async';
import 'package:flutter/foundation.dart';
import '../../data/bitget/bitget_live_store.dart';

/// 실시간 Evidence 항목 (0..100 점수, 50=중립)
class EvidenceLive {
  final String key;
  final String title;
  final int score;
  final String dir; // LONG, SHORT, NEUTRAL

  const EvidenceLive({
    required this.key,
    required this.title,
    required this.score,
    required this.dir,
  });
}

/// 실시간 Evidence 수집 허브. BitgetLiveStore 등과 연동해 items에 채움.
class EvidenceLiveHub {
  EvidenceLiveHub._();

  static final EvidenceLiveHub I = EvidenceLiveHub._();

  final ValueNotifier<List<EvidenceLive>> items = ValueNotifier<List<EvidenceLive>>([]);

  Timer? _timer;
  bool _started = false;

  void start() {
    if (_started) return;
    _started = true;
    _tick();
    _timer = Timer.periodic(const Duration(seconds: 2), (_) => _tick());
  }

  void _tick() {
    final store = BitgetLiveStore.I;
    if (!store.online.value || store.prices.length < 5) {
      if (items.value.isEmpty) return;
      items.value = [];
      items.notifyListeners();
      return;
    }
    final prices = List<double>.from(store.prices);
    final n = prices.length;
    if (n < 5) return;
    final recent = prices.sublist(n - 5);
    final prev = prices.sublist(n - 10, n - 5);
    double avg(Iterable<double> x) =>
        x.isEmpty ? 0 : x.reduce((a, b) => a + b) / x.length;
    final mom = avg(recent) - avg(prev);
    final score = (50 + (mom >= 0 ? 25 : -25)).clamp(0, 100);
    final dir = mom >= 0 ? 'LONG' : 'SHORT';
    items.value = [
      EvidenceLive(key: 'pwr', title: 'PWR', score: score, dir: dir),
      EvidenceLive(key: 'pat', title: 'PAT', score: 50, dir: 'NEUTRAL'),
      EvidenceLive(key: 'vol', title: 'VOL', score: 50, dir: 'NEUTRAL'),
    ];
    items.notifyListeners();
  }

  void stop() {
    _timer?.cancel();
    _timer = null;
    _started = false;
  }
}
