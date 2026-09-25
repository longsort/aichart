import 'dart:convert';
import 'dart:io';

class BitgetTicker {
  final String symbol;
  final double last;
  final double change24hPct; // percent, e.g. 1.23
  final double? high24h;
  final double? low24h;
  final double? baseVolume;

  const BitgetTicker({
    required this.symbol,
    required this.last,
    required this.change24hPct,
    this.high24h,
    this.low24h,
    this.baseVolume,
  });
}

class BitgetMarketService {
  final HttpClient _client = HttpClient();

  /// Bitget official endpoint (v3). We parse defensively because fields may vary.
  Future<BitgetTicker?> fetchTicker({required String symbol}) async {
    final uri = Uri.parse('https://api.bitget.com/api/v3/market/tickers');
    try {
      final req = await _client.getUrl(uri);
      req.headers.set(HttpHeaders.acceptHeader, 'application/json');
      final res = await req.close();
      final body = await res.transform(utf8.decoder).join();
      final json = jsonDecode(body);

      dynamic data = json;
      // common patterns: {data:[...]} or {data:{...}} or {data:{list:[...]}}
      if (data is Map && data.containsKey('data')) data = data['data'];
      if (data is Map && data.containsKey('list')) data = data['list'];

      if (data is List) {
        final item = data.cast<dynamic>().firstWhere(
          (e) => e is Map && (e['symbol']?.toString() == symbol || e['instId']?.toString() == symbol),
          orElse: () => null,
        );
        if (item is Map) return _fromMap(symbol, item);
      } else if (data is Map) {
        return _fromMap(symbol, data);
      }
    } catch (_) {
      // swallow; UI will show offline
    }
    return null;
  }

  BitgetTicker? _fromMap(String symbol, Map m) {
    double? d(dynamic v) => v == null ? null : double.tryParse(v.toString());
    final last = d(m['last'] ?? m['lastPr'] ?? m['close'] ?? m['price']);
    if (last == null) return null;

    // Try percent change; different keys across APIs. If absolute change provided, convert if possible.
    double changePct = 0;
    final pct = d(m['change24h'] ?? m['changePct'] ?? m['chg'] ?? m['change']);
    if (pct != null) {
      // heuristic: if value looks like 0.0123 treat as fraction; if 1.23 treat as percent
      changePct = (pct.abs() <= 1.0) ? (pct * 100) : pct;
    } else {
      final open = d(m['open24h'] ?? m['open'] ?? m['openPrice']);
      if (open != null && open != 0) changePct = ((last - open) / open) * 100;
    }

    return BitgetTicker(
      symbol: symbol,
      last: last,
      change24hPct: changePct,
      high24h: d(m['high24h'] ?? m['high']),
      low24h: d(m['low24h'] ?? m['low']),
      baseVolume: d(m['baseVolume'] ?? m['vol'] ?? m['volume']),
    );
  }

  void close() {
    _client.close(force: true);
  }
}