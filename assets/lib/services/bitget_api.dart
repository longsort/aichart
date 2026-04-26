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

  /// ✅ 중국/차단망에서 `api.bitget.com` DNS 실패가 나면
  ///    capi로 1회 자동 폴백 후 재시도
  static Future<http.Response> _getWithFallback(Uri uri) async {
    try {
      return await http.get(uri, headers: {'Accept': 'application/json'});
    } on SocketException {
      final cur = ApiConfig.httpBase.value;
      // 1회만 자동 폴백
      if (cur.contains('api.bitget.com')) {
        ApiConfig.setPreset('중국(우회)');
        final retry = Uri.parse(uri.toString().replaceFirst(cur, ApiConfig.httpBase.value));
        return await http.get(retry, headers: {'Accept': 'application/json'});
      }
      rethrow;
    }
  }

  static Ticker? _lastTicker;
  static List<Candle>? _lastCandles;
  static OrderBook? _lastBook;


  /// 화면 표시용 이름(한글)과, API 요청용 심볼(영문)을 반드시 분리해서 사용.
  /// symbol 예: "BTCUSDT"
  /// category 예: "USDT-FUTURES" (선물) / "SPOT" (현물)
  static Future<Ticker> getTicker({
    required String category,
    required String symbol,
  }) async {
    if (!rm.httpEnabled) {
      // 중국/제한망 안정모드: 네트워크 호출 안 함 (앱 실행 우선)
      return _lastTicker ?? Ticker(lastPrice: 0.0, price24hPcnt: 0.0);
    }

    final uri = Uri.parse('$_base/api/v3/market/tickers')
        .replace(queryParameters: {'category': category, 'symbol': symbol});
    final res = await _getWithFallback(uri);
    if (res.statusCode != 200) {
      throw Exception('티커 요청 실패: HTTP ${res.statusCode}');
    }
    final Map<String, dynamic> j = json.decode(res.body);
    if (j['code']?.toString() != '00000') {
      throw Exception('티커 요청 실패: ${j['msg'] ?? 'unknown'}');
    }
    final data = (j['data'] as List).cast<dynamic>();
    if (data.isEmpty) {
      throw Exception('티커 데이터 없음');
    }
    final _t = Ticker.fromJson((data.first as Map).cast<String, dynamic>());
    _lastTicker = _t;
    return _t;
}

  /// Bitget v3 candles: GET /api/v3/market/candles
  /// 문서 기준 필수 파라미터 이름은 **interval** 입니다.
  /// (예시 curl 은 granularity 라고 적혀있기도 해서 혼동이 있는데,
  /// 실제로는 interval 로 보내야 HTTP 400이 안 나는 케이스가 많습니다.)
  /// interval 예: "15m", "1H", "4H", "1D"
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
    // Bitget 문서상 캔들 limit 최대 100
    if (limit > 100) limit = 100;
    final uri = Uri.parse('$_base/api/v3/market/candles').replace(
      queryParameters: {
        'category': category,
        'symbol': symbol,
        // v3 문서: interval 이 필수
        'interval': granularity,
        // type: market/mark/index/premium (소문자)
        'type': type,
        'limit': limit.toString(),
      },
    );
    final res = await _getWithFallback(uri);
    if (res.statusCode != 200) {
      throw Exception('캔들 요청 실패: HTTP ${res.statusCode}');
    }
    final Map<String, dynamic> j = json.decode(res.body);
    if (j['code']?.toString() != '00000') {
      throw Exception('캔들 요청 실패: ${j['msg'] ?? 'unknown'}');
    }
    final raw = (j['data'] as List).cast<dynamic>();
    final candles = raw
        .whereType<List>()
        .map((arr) => Candle.fromArray(arr))
        .toList();

    // 최신이 뒤에 오도록 정렬
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
      throw Exception('체결 요청 실패: HTTP ${res.statusCode}');
    }
    final Map<String, dynamic> j = json.decode(res.body);
    if (j['code']?.toString() != '00000') {
      throw Exception('체결 요청 실패: ${j['msg'] ?? 'unknown'}');
    }
    final raw = (j['data'] as List?) ?? const [];
    final fills = raw
        .whereType<Map>()
        .map((m) => PublicFill.fromJson(m.cast<String, dynamic>()))
        .toList();
    // 최신이 뒤
    fills.sort((a, b) => a.tsMs.compareTo(b.tsMs));
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
      // 중국/제한망 안정모드: 네트워크 호출 안 함 (앱 실행 우선)
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
      throw Exception('오더북 요청 실패: HTTP ${res.statusCode}');
    }
    final Map<String, dynamic> j = json.decode(res.body);
    if (j['code']?.toString() != '00000') {
      throw Exception('오더북 요청 실패: ${j['msg'] ?? 'unknown'}');
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
