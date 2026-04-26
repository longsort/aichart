import 'dart:convert';

import 'package:http/http.dart' as http;

/// Bitget ticker fetcher (가격만)
///
/// - symbol 예: BTCUSDT_UMCBL
/// - 네트워크/형식이 조금 달라도 "last price"를 최대한 뽑아냄
class BitgetTickerService {

  String _normalizeSymbol(String s) {
    // Bitget MIX ticker usually expects "BTCUSDT" (not "BTCUSDT_UMCBL")
    if (s.contains('_')) return s.split('_').first;
    // sometimes symbols can include suffix like "BTCUSDTUMCBL" - keep as is
    return s;
  }

  final String symbol;
  final http.Client _client;

  BitgetTickerService({
    required this.symbol,
    http.Client? client,
  }) : _client = client ?? http.Client();

  /// 실패하면 null
  Future<double?> fetchLastPrice() async {
    final tries = <Uri>[
      // 1) Mix(선물) v2
      Uri.https('api.bitget.com', '/api/v2/mix/market/ticker', {
        'symbol': _normalizeSymbol(symbol),
        'productType': 'UMCBL',
      }),
      // 2) Mix(선물) v1
      Uri.https('api.bitget.com', '/api/mix/v1/market/ticker', {
        'symbol': _normalizeSymbol(symbol),
      }),
      // 3) v3 tickers (일부 환경에서 동작)
      Uri.https('api.bitget.com', '/api/v3/market/tickers', {
        'symbol': _normalizeSymbol(symbol),
      }),
      // 4) v2 spot ticker fallback (혹시 심볼이 다르게 매핑된 경우)
      Uri.https('api.bitget.com', '/api/v2/spot/market/tickers', {
        'symbol': symbol.replaceAll('_UMCBL', ''),
      }),
    ];

    for (final u in tries) {
      final p = await _tryFetch(u);
      if (p != null && p > 0) return p;
    }
    return null;
  }

  Future<double?> _tryFetch(Uri uri) async {
    try {
      final res = await _client.get(
        uri,
        headers: const {
          'accept': 'application/json',
        },
      ).timeout(const Duration(seconds: 6));

      if (res.statusCode < 200 || res.statusCode >= 300) return null;
      final body = res.body;
      if (body.isEmpty) return null;

      final j = jsonDecode(body);
      return _extractLastPrice(j);
    } catch (_) {
      return null;
    }
  }

  double? _extractLastPrice(dynamic j) {
    // Bitget 응답은 보통:
    // {"code":"00000","data":{...}} 또는 {"data":[{...}]}

    dynamic data = j;
    if (data is Map && data.containsKey('data')) {
      data = data['data'];
    }

    // data가 리스트면 심볼 매칭해서
    if (data is List) {
      for (final it in data) {
        final p = _extractFromMap(it);
        if (p != null) return p;
      }
      return null;
    }

    // data가 맵이면 바로
    if (data is Map) {
      return _extractFromMap(data);
    }

    return null;
  }

  double? _extractFromMap(dynamic m) {
    if (m is! Map) return null;

    // 여러 필드 후보들
    final keys = <String>[
      'lastPr',
      'last',
      'close',
      'price',
      'markPrice',
      'indexPrice',
    ];

    for (final k in keys) {
      final v = m[k];
      final d = _toDouble(v);
      if (d != null && d > 0) return d;
    }

    // 중첩 구조도 대비
    for (final v in m.values) {
      final d = _toDouble(v);
      if (d != null && d > 0) return d;
    }

    return null;
  }

  double? _toDouble(dynamic v) {
    if (v == null) return null;
    if (v is num) return v.toDouble();
    final s = v.toString();
    return double.tryParse(s);
  }
}
