import 'dart:convert';

import 'package:http/http.dart' as http;

/// Bitget ticker fetcher (ê°€ê²©ë§Œ)
///
/// - symbol ?? BTCUSDT_UMCBL
/// - ?¤íŠ¸?Œí¬/?•ì‹??ì¡°ê¸ˆ ?¬ë¼??"last price"ë¥?ìµœë???ë½‘ì•„??class BitgetTickerService {

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

  /// ?¤íŒ¨?˜ë©´ null
  Future<double?> fetchLastPrice() async {
    final tries = <Uri>[
      // 1) Mix(? ë¬¼) v2
      Uri.https('api.bitget.com', '/api/v2/mix/market/ticker', {
        'symbol': _normalizeSymbol(symbol),
        'productType': 'UMCBL',
      }),
      // 2) Mix(? ë¬¼) v1
      Uri.https('api.bitget.com', '/api/mix/v1/market/ticker', {
        'symbol': _normalizeSymbol(symbol),
      }),
      // 3) v3 tickers (?¼ë? ?˜ê²½?ì„œ ?™ì‘)
      Uri.https('api.bitget.com', '/api/v3/market/tickers', {
        'symbol': _normalizeSymbol(symbol),
      }),
      // 4) v2 spot ticker fallback (?¹ì‹œ ?¬ë³¼???¤ë¥´ê²?ë§¤í•‘??ê²½ìš°)
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
    // Bitget ?‘ë‹µ?€ ë³´í†µ:
    // {"code":"00000","data":{...}} ?ëŠ” {"data":[{...}]}

    dynamic data = j;
    if (data is Map && data.containsKey('data')) {
      data = data['data'];
    }

    // dataê°€ ë¦¬ìŠ¤?¸ë©´ ?¬ë³¼ ë§¤ì¹­?´ì„œ
    if (data is List) {
      for (final it in data) {
        final p = _extractFromMap(it);
        if (p != null) return p;
      }
      return null;
    }

    // dataê°€ ë§µì´ë©?ë°”ë¡œ
    if (data is Map) {
      return _extractFromMap(data);
    }

    return null;
  }

  double? _extractFromMap(dynamic m) {
    if (m is! Map) return null;

    // ?¬ëŸ¬ ?„ë“œ ?„ë³´??    final keys = <String>[
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

    // ì¤‘ì²© êµ¬ì¡°???€ë¹?    for (final v in m.values) {
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
