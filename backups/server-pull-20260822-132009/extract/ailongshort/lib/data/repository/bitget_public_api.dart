import 'dart:convert';
import 'dart:io';

/// Bitget 공식 공개(무료) Market API ?�퍼 (?�물 MIX)
/// - API KEY 불필??/// - ?��? ?�키지(http) ?�이 dart:io 로만 ?�작 (Windows 빌드 ?�정)
class BitgetPublicApi {
  final String baseUrl;
  const BitgetPublicApi({this.baseUrl = 'https://api.bitget.com'});

  Future<Map<String, dynamic>> _get(String path, Map<String, String> q) async {
    final uri = Uri.parse('$baseUrl$path').replace(queryParameters: q);
    final client = HttpClient();
    try {
      final req = await client.getUrl(uri);
      req.headers.set('accept', 'application/json');
      final res = await req.close();
      final body = await res.transform(utf8.decoder).join();
      if (res.statusCode != 200) {
        throw Exception('HTTP ${res.statusCode}: $body');
      }
      return json.decode(body) as Map<String, dynamic>;
    } finally {
      client.close(force: true);
    }
  }

  Future<double> tickerPrice({required String symbol, String productType = 'USDT-FUTURES'}) async {
    final j = await _get('/api/v2/mix/market/ticker', {
      'symbol': symbol,
      'productType': productType,
    });
    final data = (j['data'] as Map<String, dynamic>);
    final p = data['lastPr'] ?? data['last'] ?? data['close'];
    return (p as num).toDouble();
  }

  /// granularity: 1m/5m/15m/30m/1H/4H/1D/1W/1M
  Future<List<List<num>>> candles({
    required String symbol,
    required String granularity,
    int limit = 120,
    int? startTime,
    int? endTime,
    String productType = 'USDT-FUTURES',
  }) async {
    final q = <String, String>{
      'symbol': symbol,
      'granularity': granularity,
      'limit': '$limit',
      'productType': productType,
    };
    // Bitget supports (startTime, endTime) in ms for paging.
    if (startTime != null) q['startTime'] = '$startTime';
    if (endTime != null) q['endTime'] = '$endTime';

    final j = await _get('/api/v2/mix/market/candles', q);
    final arr = (j['data'] as List).cast<List>();
    return arr.map((e) => e.map((x) => (x as num)).toList()).toList();
  }

  Future<List<Map<String, dynamic>>> fills({
    required String symbol,
    int limit = 50,
    String productType = 'USDT-FUTURES',
  }) async {
    final j = await _get('/api/v2/mix/market/fills', {
      'symbol': symbol,
      'limit': '$limit',
      'productType': productType,
    });
    return (j['data'] as List).cast<Map<String, dynamic>>();
  }

  Future<Map<String, dynamic>> depth({
    required String symbol,
    int limit = 50,
    String productType = 'USDT-FUTURES',
  }) async {
    final j = await _get('/api/v2/mix/market/depth', {
      'symbol': symbol,
      'limit': '$limit',
      'productType': productType,
    });
    return (j['data'] as Map<String, dynamic>);
  }
}
