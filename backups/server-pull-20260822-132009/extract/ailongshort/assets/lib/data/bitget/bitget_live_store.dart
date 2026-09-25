import 'dart:async';
import 'package:flutter/foundation.dart';
import 'bitget_client.dart';

class BitgetLiveStore {
  static final BitgetLiveStore I = BitgetLiveStore._();
  BitgetLiveStore._();

  final BitgetClient _client = BitgetClient();
  final ValueNotifier<BitgetTicker?> ticker = ValueNotifier<BitgetTicker?>(null);
  final ValueNotifier<bool> online = ValueNotifier<bool>(false);

  // simple ring buffers to support CORE/multiTF
  final List<double> prices = <double>[];
  final List<double> vols = <double>[];

  // whale streak (based on 24h quote volume bucket)
  String whaleGrade = 'LOW';
  int whaleStreak = 1;

  Timer? _t;

  void start({String symbol = 'BTCUSDT', Duration interval = const Duration(seconds: 2)}) {
    _t?.cancel();
    _tick(symbol);
    _t = Timer.periodic(interval, (_) => _tick(symbol));
  }

  // stop polling (used by UI lifecycle)
  void stop() {
    _t?.cancel();
    _t = null;
  }

  // latest price convenience (some widgets expect a getter)
  double get livePrice => ticker.value?.last ?? 0.0;

  void _pushRing(List<double> a, double v, int maxLen) {
    a.add(v);
    if (a.length > maxLen) a.removeAt(0);
  }

  String _gradeFromVol(double qv) {
    if (qv > 5e10) return 'ULTRA';
    if (qv > 1e10) return 'HIGH';
    if (qv > 3e9) return 'MID';
    return 'LOW';
  }

  Future<void> _tick(String symbol) async {
    final t = await _client.fetchTicker(symbol);
    if (t == null || t.last == 0) {
      online.value = false;
      return;
    }
    online.value = true;
    ticker.value = t;

    _pushRing(prices, t.last, 300);
    // volume is coarse (24h quote volume); still useful for whale bucket & momentum proxy
    _pushRing(vols, t.quoteVolume24h, 300);

    final g = _gradeFromVol(t.quoteVolume24h);
    if (g == whaleGrade) {
      whaleStreak += 1;
    } else {
      whaleGrade = g;
      whaleStreak = 1;
    }
  }

  void dispose() {
    _t?.cancel();
    _client.close();
  }
}