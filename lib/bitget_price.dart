
import 'dart:convert';
import 'package:http/http.dart' as http;

class BitgetPriceClient {
  // Bitget v3 market tickers endpoint (public)
  // NOTE: Some regions/providers may block; app handles errors gracefully.
  static const String _base = "https://api.bitget.com";

  Future<double?> fetchLastPrice({
    required String symbol, // e.g. BTCUSDT
    String productType = "USDT-FUTURES", // or "USDT-FUTURES" / "USDT"
  }) async {
    final uri = Uri.parse("$_base/api/v3/market/tickers?productType=$productType");
    final res = await http.get(uri).timeout(const Duration(seconds: 6));
    if (res.statusCode != 200) return null;

    final j = json.decode(res.body);
    final data = j is Map ? j["data"] : null;
    if (data is! List) return null;

    for (final row in data) {
      if (row is Map) {
        final s = (row["symbol"] ?? row["instId"] ?? "").toString();
        if (s.toUpperCase() == symbol.toUpperCase()) {
          final last = row["lastPr"] ?? row["last"] ?? row["close"] ?? row["price"];
          return double.tryParse(last.toString());
        }
      }
    }
    return null;
  }
}
