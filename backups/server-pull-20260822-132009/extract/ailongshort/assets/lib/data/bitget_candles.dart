import 'dart:convert';
import 'package:http/http.dart' as http;

class Candle {
  final DateTime ts;
  final double open;
  final double high;
  final double low;
  final double close;
  final double volBase;
  final double volQuote;

  Candle({
    required this.ts,
    required this.open,
    required this.high,
    required this.low,
    required this.close,
    required this.volBase,
    required this.volQuote,
  });
}

class BitgetCandleClient {
  static const String _base = 'https://api.bitget.com';

  Future<List<Candle>> fetch({
    required String symbol,
    required String granularity, // 15m, 1H, 4H, 1D, 1W, 1M
    String productType = 'usdt-futures',
    int limit = 120,
  }) async {
    final uri = Uri.parse('$_base/api/v2/mix/market/candles'
        '?symbol=${symbol.toUpperCase()}&granularity=$granularity&limit=$limit&productType=$productType');
    final res = await http.get(uri).timeout(const Duration(seconds: 8));
    if (res.statusCode != 200) return const [];
    final obj = jsonDecode(res.body);
    if (obj is! Map) return const [];
    final data = obj['data'];
    if (data is! List) return const [];
    final out = <Candle>[];
    for (final row in data) {
      if (row is List && row.length >= 7) {
        final tsMs = int.tryParse(row[0].toString());
        final o = double.tryParse(row[1].toString());
        final h = double.tryParse(row[2].toString());
        final l = double.tryParse(row[3].toString());
        final c = double.tryParse(row[4].toString());
        final vb = double.tryParse(row[5].toString()) ?? 0;
        final vq = double.tryParse(row[6].toString()) ?? 0;
        if (tsMs == null || o == null || h == null || l == null || c == null) continue;
        out.add(Candle(
          ts: DateTime.fromMillisecondsSinceEpoch(tsMs),
          open: o,
          high: h,
          low: l,
          close: c,
          volBase: vb,
          volQuote: vq,
        ));
      }
    }
    // API returns newest first; reverse to ascending
    out.sort((a,b)=>a.ts.compareTo(b.ts));
    return out;
  }

  static double vwap(List<Candle> cs) {
    double num = 0;
    double den = 0;
    for (final c in cs) {
      final tp = (c.high + c.low + c.close) / 3.0;
      num += tp * c.volBase;
      den += c.volBase;
    }
    if (den == 0) return cs.isEmpty ? 0 : cs.last.close;
    return num / den;
  }

  static double atr(List<Candle> cs, {int period = 14}) {
    if (cs.length < 2) return 0;
    final n = cs.length;
    final start = (n - period - 1).clamp(0, n-2);
    double sum = 0;
    int cnt = 0;
    for (int i = start+1; i < n; i++) {
      final prev = cs[i-1];
      final cur = cs[i];
      final tr1 = cur.high - cur.low;
      final tr2 = (cur.high - prev.close).abs();
      final tr3 = (cur.low - prev.close).abs();
      final tr = [tr1, tr2, tr3].reduce((a,b)=>a>b?a:b);
      sum += tr;
      cnt++;
    }
    return cnt==0?0:sum/cnt;
  }
}
