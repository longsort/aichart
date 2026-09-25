import 'dart:convert';
import 'dart:io';
import 'bitget_flow_ws.dart';

/// Bitget Public REST (v3) - HttpClient only (no extra deps)
///
/// 목표: 기존 Fulink Pro Ultra에서 쓰던 실데이터 흐름을 cion 앱에 이식.
/// - 티커(현재가)
/// - 캔들
/// - 오더북
/// - 최근 체결
///
/// NOTE: 네트워크가 막힌 환경에서도 앱이 죽지 않도록 전부 null/빈값 안전 처리.
class BitgetPublic {
  static const String _base = 'https://api.bitget.com';

  static final HttpClient _http = HttpClient()..connectionTimeout = const Duration(seconds: 6);

  static Future<Map<String, dynamic>?> _getJson(Uri uri) async {
    try {
      final req = await _http.getUrl(uri);
      req.headers.set('Accept', 'application/json');
      final res = await req.close();
      if (res.statusCode != 200) return null;
      final body = await res.transform(utf8.decoder).join();
      final obj = jsonDecode(body);
      return obj is Map<String, dynamic> ? obj : null;
    } catch (_) {
      return null;
    }
  }

  /// category: 'USDT-FUTURES' (선물) / 'SPOT' (현물)
  static Future<double?> getLastPrice({required String category, required String symbol}) async {
    final uri = Uri.parse('$_base/api/v3/market/tickers').replace(
      queryParameters: {'category': category, 'symbol': symbol},
    );
    final j = await _getJson(uri);
    if (j == null) return null;
    if (j['code']?.toString() != '00000') return null;
    final data = j['data'];
    if (data is! List || data.isEmpty) return null;
    final m = data.first;
    if (m is! Map) return null;
    final last = m['lastPr'] ?? m['last'] ?? m['close'] ?? m['lastPrice'];
    return double.tryParse(last?.toString() ?? '');
  }

  /// Candles (Bitget v3): GET /api/v3/market/candles
  /// interval: '5m','15m','1H','4H','1D','1W','1M'
  /// after: ms timestamp — 더 오래된 캔들 페이지네이션(선택)
  /// before: ms timestamp — 더 최신 캔들 페이지네이션(선택)
  /// returns list of [ts, open, high, low, close, volume, quoteVol]
  static Future<List<List<dynamic>>> getCandlesRaw({
    required String category,
    required String symbol,
    required String interval,
    int limit = 100,
    String type = 'market',
    int? after,
    int? before,
  }) async {
    // Bitget v3는 limit 상한이 문서/상품군에 따라 다를 수 있어,
    // 화면 가독성을 위해 200까지 허용(그 이상은 자동 캡).
    if (limit > 200) limit = 200;
    final params = <String, String>{
      'category': category,
      'symbol': symbol,
      'interval': interval,
      'type': type,
      'limit': limit.toString(),
    };
    if (after != null) params['after'] = after.toString();
    if (before != null) params['before'] = before.toString();
    final uri = Uri.parse('$_base/api/v3/market/candles').replace(
      queryParameters: params,
    );
    final j = await _getJson(uri);
    if (j == null) return const [];
    if (j['code']?.toString() != '00000') return const [];
    final data = j['data'];
    if (data is! List) return const [];
    return data.whereType<List>().toList();
  }

  /// OrderBook (v3): GET /api/v3/market/orderbook
  /// returns map { a: [[price, qty],..], b: [[price, qty],..], ts: ... }
  static Future<Map<String, dynamic>?> getOrderBook({
    required String category,
    required String symbol,
    int limit = 50,
  }) async {

    // PATCH-2: prefer WS cache (trade/books) when available
    if (category.toUpperCase() == 'USDT-FUTURES') {
      BitgetFlowWs.I.ensureStarted(symbol: symbol, instType: category);
      final cached = BitgetFlowWs.I.lastOrderBook;
      final tsOk = BitgetFlowWs.I.lastOrderBookAt;
      if (cached != null && tsOk != null && DateTime.now().difference(tsOk) < const Duration(seconds: 3)) {
        return cached;
      }
    }
if (limit < 5) limit = 5;
    if (limit > 200) limit = 200;
    final uri = Uri.parse('$_base/api/v3/market/orderbook').replace(
      queryParameters: {
        'category': category,
        'symbol': symbol,
        'limit': limit.toString(),
      },
    );
    final j = await _getJson(uri);
    if (j == null) return null;
    if (j['code']?.toString() != '00000') return null;
    final data = j['data'];
    if (data is Map) return data.cast<String, dynamic>();
    return null;
  }

  /// Recent Fills (v3): GET /api/v3/market/fills
  static Future<List<Map<String, dynamic>>> getRecentFills({
    required String category,
    required String symbol,
    int limit = 100,
  }) async {

    // PATCH-2: prefer WS cache (recent trades) when available
    if (category.toUpperCase() == 'USDT-FUTURES') {
      BitgetFlowWs.I.ensureStarted(symbol: symbol, instType: category);
      final tsOk = BitgetFlowWs.I.lastFillAt;
      final cached = BitgetFlowWs.I.recentFills;
      if (cached.isNotEmpty && tsOk != null && DateTime.now().difference(tsOk) < const Duration(seconds: 3)) {
        // keep newest first like REST often returns
        final list = List<Map<String, dynamic>>.from(cached.reversed);
        if (list.length > limit) return list.take(limit).toList();
        return list;
      }
    }
if (limit > 100) limit = 100;
    final uri = Uri.parse('$_base/api/v3/market/fills').replace(
      queryParameters: {
        'category': category,
        'symbol': symbol,
        'limit': limit.toString(),
      },
    );
    final j = await _getJson(uri);
    if (j == null) return const [];
    if (j['code']?.toString() != '00000') return const [];
    final data = j['data'];
    if (data is! List) return const [];
    return data.whereType<Map>().map((e) => e.cast<String, dynamic>()).toList();
  }
}
