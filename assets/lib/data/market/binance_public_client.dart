import 'dart:async';
import 'dart:convert';
import 'package:http/http.dart' as http;
import 'market_ticker.dart';

class BinancePublicClient {
  BinancePublicClient({http.Client? client}) : _client = client ?? http.Client();

  final http.Client _client;
  Timer? _timer;

  Future<MarketTicker> fetchTicker(String symbol) async {
    final uri = Uri.https('api.binance.com', '/api/v3/ticker/price', {'symbol': symbol});
    final res = await _client.get(uri).timeout(const Duration(seconds: 6));
    if (res.statusCode != 200) throw Exception('binance http ${res.statusCode}');
    final m = jsonDecode(res.body) as Map<String, dynamic>;
    final p = double.tryParse((m['price'] ?? '0').toString()) ?? 0.0;
    return MarketTicker(symbol: symbol, last: p, connected: true, ts: DateTime.now());
  }

  void startPolling({
    required String symbol,
    required Duration interval,
    required void Function(MarketTicker t) onTick,
    void Function()? onError,
  }) {
    stop();
    _timer = Timer.periodic(interval, (_) async {
      try {
        final t = await fetchTicker(symbol);
        onTick(t);
      } catch (_) {
        onError?.call();
      }
    });
  }

  void stop() {
    _timer?.cancel();
    _timer = null;
  }

  void dispose() {
    stop();
    _client.close();
  }
}
