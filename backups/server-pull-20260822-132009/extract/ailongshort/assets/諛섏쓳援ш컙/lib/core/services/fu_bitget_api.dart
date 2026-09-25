import 'dart:convert';
import 'dart:io';

/// STEP 7: 내장 Bitget Public API (의존성 추가 없이 HttpClient 사용)
/// - 인증 불필요(공개 데이터)
/// - productType 기본: USDT-FUTURES
class FuBitgetApi {
  final String baseUrl;
  final String productType;

  FuBitgetApi({
    this.baseUrl = 'https://api.bitget.com',
    this.productType = 'USDT-FUTURES',
  });

  Future<Map<String, dynamic>> getOrderBook({required String symbol, int limit = 20}) async {
    // v2 mix books (공개)
    final uri = Uri.parse(
      '$baseUrl/api/v2/mix/market/books?symbol=$symbol&productType=$productType&limit=$limit',
    );
    final json = await _getJson(uri);
    return json;
  }

  Future<Map<String, dynamic>> getRecentFills({required String symbol, int limit = 80}) async {
    // v2 mix fills (공개)
    final uri = Uri.parse(
      '$baseUrl/api/v2/mix/market/fills?symbol=$symbol&productType=$productType&limit=$limit',
    );
    final json = await _getJson(uri);
    return json;
  }

  Future<Map<String, dynamic>> _getJson(Uri uri) async {
    final client = HttpClient();
    try {
      final req = await client.getUrl(uri);
      req.headers.set('accept', 'application/json');
      final res = await req.close();
      final body = await res.transform(utf8.decoder).join();
      final decoded = jsonDecode(body);
      if (decoded is Map<String, dynamic>) return decoded;
      return {'data': decoded};
    } finally {
      client.close(force: true);
    }
  }
}
