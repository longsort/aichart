import 'dart:convert';
import 'dart:io';

class BitgetTicker {
  final String symbol;
  final double last;
  final double change24hPct;
  final double quoteVolume24h;

  const BitgetTicker({
    required this.symbol,
    required this.last,
    required this.change24hPct,
    required this.quoteVolume24h,
  });
}

class BitgetClient {
  final HttpClient _http = HttpClient();

  BitgetClient() {
    // ?¼ë? ?˜ê²½(?¹íˆ Windows)?ì„œ User-Agent ?†ìœ¼ë©??‘ë‹µ??ë¶ˆì•ˆ?•í•œ ì¼€?´ìŠ¤ê°€ ?ˆì–´ ê³ ì •.
    try {
      _http.userAgent = 'FulinkPro/1.0 (flutter)';
    } catch (_) {
      // ignore
    }
  }

  Future<BitgetTicker?> fetchTicker(String symbol) async {
    // Bitget ê³µê°œ API(ë¬´ë£Œ): ?”ë“œ?¬ì¸???„ë“œê°€ ë²„ì „ë³„ë¡œ ?¬ë¼ ?¤íŒ¨?????ˆì–´
    // ?¬ëŸ¬ ?„ë³´ë¥??œì°¨ ?œë„?œë‹¤. (Windows/ëª¨ë°”??ëª¨ë‘ ?ˆì •?ìœ¼ë¡?ê°€ê²©ì´ ?¨ê²Œ)
    final uris = <Uri>[
      // v3
      Uri.parse('https://api.bitget.com/api/v3/market/tickers?productType=USDT-FUTURES'),
      // v2 mix
      Uri.parse('https://api.bitget.com/api/v2/mix/market/tickers?productType=USDT-FUTURES'),
      Uri.parse('https://api.bitget.com/api/v2/mix/market/tickers?productType=usdt-futures'),
      // v2 spot fallback(ê·¸ë˜??ê°€ê²©ì? ??
      Uri.parse('https://api.bitget.com/api/v2/spot/market/tickers'),
    ];

    dynamic obj;
    for (final uri in uris) {
      try {
        final req = await _http.getUrl(uri);
        req.headers.set('Accept', 'application/json');
        final res = await req.close();
        final body = await res.transform(utf8.decoder).join();
        obj = jsonDecode(body);
        if (obj is Map && (obj['data'] is List || obj['data'] is Map)) {
          break;
        }
      } catch (_) {
        // try next
      }
    }
    try {
      if (obj == null) return null;

      // dataê°€ List / Map ?????????ˆìŒ
      dynamic data = obj is Map ? obj['data'] : null;
      if (data is Map && data['data'] is List) data = data['data'];
      if (data is Map && data['ticker'] is List) data = data['ticker'];

      // v2 ?¨ì¼ ticker ?•íƒœë¡?????      if (data is Map) {
        data = [data];
      }
      if (data is! List) return null;

      // Try match on symbol (e.g., BTCUSDT / BTCUSDT_UMCBL / BTCUSDT_PERP ??
      Map? hit;
      final want = symbol.toUpperCase();
      final want2 = '${want}_UMCBL';
      final want3 = '${want}_CMCBL';
      // 1) ?•í™• ?¼ì¹˜ ?°ì„ 
      for (final it in data) {
        if (it is Map) {
          final s = (it['symbol'] ?? it['instId'] ?? it['contractCode'] ?? it['instrumentId'] ?? it['code'] ?? '').toString();
          final ss = s.toUpperCase();
          if (ss == want || ss == want2 || ss == want3) {
            hit = it;
            break;
          }
        }
      }
      // 2) ë¶€ë¶??¼ì¹˜(ë°±ì—…)
      for (final it in data) {
        if (it is Map) {
          final s = (it['symbol'] ?? it['instId'] ?? it['contractCode'] ?? it['instrumentId'] ?? it['code'] ?? '').toString();
          final ss = s.toUpperCase();
          if (hit == null && (ss.contains(want) || ss.contains(want2) || ss.contains(want3))) {
            hit = it;
            break;
          }
        }
      }
      if (hit == null) return null;

      double dparse(dynamic v) {
        if (v == null) return 0.0;
        if (v is num) return v.toDouble();
        return double.tryParse(v.toString()) ?? 0.0;
      }

      final last = dparse(hit['lastPr'] ?? hit['last'] ?? hit['close'] ?? hit['lastPrice'] ?? hit['price']);
      final changePct = dparse(hit['change24h'] ?? hit['chg24h'] ?? hit['priceChangePercent'] ?? hit['changeRate'] ?? hit['chg']);
      final qv = dparse(hit['quoteVolume'] ?? hit['quoteVol'] ?? hit['usdtVolume'] ?? hit['quoteVolume24h'] ?? hit['volValue'] ?? hit['quoteVol24h']);

      // Some endpoints return change rate as fraction (0.01 = 1%)
      final adjChangePct = (changePct.abs() <= 1.5) ? changePct * 100 : changePct;

      return BitgetTicker(
        symbol: symbol,
        last: last,
        change24hPct: adjChangePct,
        quoteVolume24h: qv,
      );
    } catch (_) {
      return null;
    }
  }

  void close() {
    _http.close(force: true);
  }
}