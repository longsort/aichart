import 'dart:convert';
import 'dart:io';
import 'package:http/http.dart' as http;

import '../models/candle.dart';
import '../models/ticker.dart';
import 'api_config.dart';
import 'runtime_mode.dart' as rm;

class PublicFill {
  final double price;
  final double size;
  final String side; // buy/sell
  final int tsMs;

  const PublicFill({
    required this.price,
    required this.size,
    required this.side,
    required this.tsMs,
  });

  factory PublicFill.fromJson(Map<String, dynamic> j) {
    return PublicFill(
      price: double.tryParse(j['price']?.toString() ?? '') ?? 0,
      size: double.tryParse(j['size']?.toString() ?? '') ?? 0,
      side: (j['side']?.toString() ?? '').toLowerCase(),
      tsMs: int.tryParse(j['ts']?.toString() ?? '') ?? 0,
    );
  }
}

class OrderBook {
  final List<List<double>> asks; // [price, qty]
  final List<List<double>> bids; // [price, qty]
  final int tsMs;

  const OrderBook({required this.asks, required this.bids, required this.tsMs});
}

class BitgetApi {
  static String get _base => ApiConfig.httpBase.value;

  /// ??ì¤‘êµ­/ì°¨ë‹¨ë§ì—??`api.bitget.com` DNS ?¤íŒ¨ê°€ ?˜ë©´
  ///    capië¡?1???ë™ ?´ë°± ???¬ì‹œ??  static Future<http.Response> _getWithFallback(Uri uri) async {
    try {
      return await http.get(uri, headers: {'Accept': 'application/json'});
    } on SocketException {
      final cur = ApiConfig.httpBase.value;
      // 1?Œë§Œ ?ë™ ?´ë°±
      if (cur.contains('api.bitget.com')) {
        ApiConfig.setPreset('ì¤‘êµ­(?°íšŒ)');
        final retry = Uri.parse(uri.toString().replaceFirst(cur, ApiConfig.httpBase.value));
        return await http.get(retry, headers: {'Accept': 'application/json'});
      }
      rethrow;
    }
  }

  static Ticker? _lastTicker;
  static List<Candle>? _lastCandles;
  static OrderBook? _lastBook;


  /// ?”ë©´ ?œì‹œ???´ë¦„(?œê?)ê³? API ?”ì²­???¬ë³¼(?ë¬¸)??ë°˜ë“œ??ë¶„ë¦¬?´ì„œ ?¬ìš©.
  /// symbol ?? "BTCUSDT"
  /// category ?? "USDT-FUTURES" (? ë¬¼) / "SPOT" (?„ë¬¼)
  static Future<Ticker> getTicker({
    required String category,
    required String symbol,
  }) async {
    if (!rm.httpEnabled) {
      // ì¤‘êµ­/?œí•œë§??ˆì •ëª¨ë“œ: ?¤íŠ¸?Œí¬ ?¸ì¶œ ????(???¤í–‰ ?°ì„ )
      return _lastTicker ?? Ticker(lastPrice: 0.0, price24hPcnt: 0.0);
    }

    final uri = Uri.parse('$_base/api/v3/market/tickers')
        .replace(queryParameters: {'category': category, 'symbol': symbol});
    final res = await _getWithFallback(uri);
    if (res.statusCode != 200) {
      throw Exception('?°ì»¤ ?”ì²­ ?¤íŒ¨: HTTP ${res.statusCode}');
    }
    final Map<String, dynamic> j = json.decode(res.body);
    if (j['code']?.toString() != '00000') {
      throw Exception('?°ì»¤ ?”ì²­ ?¤íŒ¨: ${j['msg'] ?? 'unknown'}');
    }
    final data = (j['data'] as List).cast<dynamic>();
    if (data.isEmpty) {
      throw Exception('?°ì»¤ ?°ì´???†ìŒ');
    }
    final _t = Ticker.fromJson((data.first as Map).cast<String, dynamic>());
    _lastTicker = _t;
    return _t;
}

  /// Bitget v3 candles: GET /api/v3/market/candles
  /// ë¬¸ì„œ ê¸°ì? ?„ìˆ˜ ?Œë¼ë¯¸í„° ?´ë¦„?€ **interval** ?…ë‹ˆ??
  /// (?ˆì‹œ curl ?€ granularity ?¼ê³  ?í??ˆê¸°???´ì„œ ?¼ë™???ˆëŠ”??
  /// ?¤ì œë¡œëŠ” interval ë¡?ë³´ë‚´??HTTP 400?????˜ëŠ” ì¼€?´ìŠ¤ê°€ ë§ìŠµ?ˆë‹¤.)
  /// interval ?? "15m", "1H", "4H", "1D"
  static Future<List<Candle>> getCandles({
    required String category,
    required String symbol,
    required String granularity,
    int limit = 100,
    String type = 'market',
  }) async {
    if (!rm.httpEnabled) {
      return _lastCandles ?? const <Candle>[];
    }
    // Bitget ë¬¸ì„œ??ìº”ë“¤ limit ìµœë? 100
    if (limit > 100) limit = 100;
    final uri = Uri.parse('$_base/api/v3/market/candles').replace(
      queryParameters: {
        'category': category,
        'symbol': symbol,
        // v3 ë¬¸ì„œ: interval ???„ìˆ˜
        'interval': granularity,
        // type: market/mark/index/premium (?Œë¬¸??
        'type': type,
        'limit': limit.toString(),
      },
    );
    final res = await _getWithFallback(uri);
    if (res.statusCode != 200) {
      throw Exception('ìº”ë“¤ ?”ì²­ ?¤íŒ¨: HTTP ${res.statusCode}');
    }
    final Map<String, dynamic> j = json.decode(res.body);
    if (j['code']?.toString() != '00000') {
      throw Exception('ìº”ë“¤ ?”ì²­ ?¤íŒ¨: ${j['msg'] ?? 'unknown'}');
    }
    final raw = (j['data'] as List).cast<dynamic>();
    final candles = raw
        .whereType<List>()
        .map((arr) => Candle.fromArray(arr))
        .toList();

    // ìµœì‹ ???¤ì— ?¤ë„ë¡??•ë ¬
    candles.sort((a, b) => a.tsMs.compareTo(b.tsMs));
    _lastCandles = candles;
    return candles;
  }

  /// Get Recent Public Fills (Bitget UTA v3)
  /// GET /api/v3/market/fills
  /// Docs: https://www.bitget.com/api-doc/uta/public/Fills
  static Future<List<PublicFill>> getRecentFills({
    required String category,
    required String symbol,
    int limit = 100,
  }) async {
    if (!rm.httpEnabled) {
      return const <PublicFill>[];
    }
    if (limit > 100) limit = 100;
    final uri = Uri.parse('$_base/api/v3/market/fills').replace(
      queryParameters: {
        'category': category,
        'symbol': symbol,
        'limit': limit.toString(),
      },
    );
    final res = await _getWithFallback(uri);
    if (res.statusCode != 200) {
      throw Exception('ì²´ê²° ?”ì²­ ?¤íŒ¨: HTTP ${res.statusCode}');
    }
    final Map<String, dynamic> j = json.decode(res.body);
    if (j['code']?.toString() != '00000') {
      throw Exception('ì²´ê²° ?”ì²­ ?¤íŒ¨: ${j['msg'] ?? 'unknown'}');
    }
    final raw = (j['data'] as List?) ?? const [];
    final fills = raw
        .whereType<Map>()
        .map((m) => PublicFill.fromJson(m.cast<String, dynamic>()))
        .toList();
    // ìµœì‹ ????    fills.sort((a, b) => a.tsMs.compareTo(b.tsMs));
    return fills;
  }

  /// Get OrderBook (Bitget UTA v3)
  /// GET /api/v3/market/orderbook
  /// Docs: https://www.bitget.com/api-doc/uta/public/OrderBook
  static Future<OrderBook> getOrderBook({
    required String category,
    required String symbol,
    int limit = 50,
  }) async {
    if (!rm.httpEnabled) {
      // ì¤‘êµ­/?œí•œë§??ˆì •ëª¨ë“œ: ?¤íŠ¸?Œí¬ ?¸ì¶œ ????(???¤í–‰ ?°ì„ )
      return _lastBook ?? OrderBook(asks: const [], bids: const [], tsMs: DateTime.now().millisecondsSinceEpoch);
    }

    if (limit > 200) limit = 200;
    if (limit < 5) limit = 5;
    final uri = Uri.parse('$_base/api/v3/market/orderbook').replace(
      queryParameters: {
        'category': category,
        'symbol': symbol,
        'limit': limit.toString(),
      },
    );
    final res = await _getWithFallback(uri);
    if (res.statusCode != 200) {
      throw Exception('?¤ë”ë¶??”ì²­ ?¤íŒ¨: HTTP ${res.statusCode}');
    }
    final Map<String, dynamic> j = json.decode(res.body);
    if (j['code']?.toString() != '00000') {
      throw Exception('?¤ë”ë¶??”ì²­ ?¤íŒ¨: ${j['msg'] ?? 'unknown'}');
    }
    final data = (j['data'] as Map).cast<String, dynamic>();
    List<List<double>> parseSide(dynamic arr) {
      if (arr is! List) return const [];
      return arr
          .whereType<List>()
          .map((e) => [
                (e.isNotEmpty ? (e[0] as num).toDouble() : 0.0),
                (e.length > 1 ? (e[1] as num).toDouble() : 0.0),
              ])
          .toList();
    }

    return OrderBook(
      asks: parseSide(data['a']),
      bids: parseSide(data['b']),
      tsMs: int.tryParse(data['ts']?.toString() ?? '') ?? 0,
    );
  }
}
