import 'dart:convert';

import 'package:http/http.dart' as http;

import '../core/exchange.dart';
import '../model/candle.dart';

class MarketApi {
  MarketApi({http.Client? client}) : _client = client ?? http.Client();
  final http.Client _client;

  Future<double?> fetchLastPrice({
    required Exchange exchange,
    required String symbol,
  }) async {
    switch (exchange) {
      case Exchange.bitget:
        // Bitget Spot ticker (공식 공개 엔드포인트)
        // 1) /api/v2/spot/market/tickers?symbol=BTCUSDT
        // 2) /api/v2/spot/market/ticker?symbol=BTCUSDT
        final url1 = Uri.parse('https://api.bitget.com/api/v2/spot/market/tickers?symbol=$symbol');
        final p1 = await _tryBitgetTickers(url1);
        if (p1 != null) return p1;
        final url2 = Uri.parse('https://api.bitget.com/api/v2/spot/market/ticker?symbol=$symbol');
        return _tryBitgetTicker(url2);

      case Exchange.binance:
        final url = Uri.parse('https://api.binance.com/api/v3/ticker/price?symbol=$symbol');
        final r = await _client.get(url).timeout(const Duration(seconds: 10));
        if (r.statusCode != 200) return null;
        final j = jsonDecode(r.body) as Map<String, dynamic>;
        return double.tryParse(j['price']?.toString() ?? '');

      case Exchange.bybit:
        final url = Uri.parse('https://api.bybit.com/v5/market/tickers?category=spot&symbol=$symbol');
        final r = await _client.get(url).timeout(const Duration(seconds: 10));
        if (r.statusCode != 200) return null;
        final j = jsonDecode(r.body) as Map<String, dynamic>;
        final list = (j['result']?['list'] as List?) ?? const [];
        if (list.isEmpty) return null;
        final item = list.first as Map<String, dynamic>;
        return double.tryParse(item['lastPrice']?.toString() ?? '');
    }
  }

  Future<List<Candle>> fetchCandles({
    required Exchange exchange,
    required String symbol,
    required Tf tf,
    int limit = 120,
  }) async {
    try {
      switch (exchange) {
        case Exchange.binance:
          final url = Uri.parse('https://api.binance.com/api/v3/klines?symbol=$symbol&interval=${tf.binanceInterval}&limit=$limit');
          final r = await _client.get(url).timeout(const Duration(seconds: 10));
          if (r.statusCode != 200) return const [];
          final raw = jsonDecode(r.body) as List;
          return raw.map((e) {
            final l = e as List;
            return Candle(
              openTimeMs: (l[0] as num).toInt(),
              open: double.parse(l[1].toString()),
              high: double.parse(l[2].toString()),
              low: double.parse(l[3].toString()),
              close: double.parse(l[4].toString()),
              volume: double.parse(l[5].toString()),
              closeTimeMs: (l[6] as num).toInt(),
            );
          }).toList(growable: false);

        case Exchange.bitget:
          // Bitget candles: /api/v2/spot/market/candles?symbol=BTCUSDT&granularity=15min&limit=120
          final gran = _bitgetGranularity(tf);
          final url = Uri.parse('https://api.bitget.com/api/v2/spot/market/candles?symbol=$symbol&granularity=$gran&limit=$limit');
          final r = await _client.get(url).timeout(const Duration(seconds: 10));
          if (r.statusCode != 200) return const [];
          final j = jsonDecode(r.body) as Map<String, dynamic>;
          final data = (j['data'] as List?) ?? const [];
          // Bitget: [ts, open, high, low, close, baseVol, quoteVol]
          return data.map((e) {
            final l = e as List;
            final ts = (l[0] as num).toInt();
            return Candle(
              openTimeMs: ts,
              open: double.parse(l[1].toString()),
              high: double.parse(l[2].toString()),
              low: double.parse(l[3].toString()),
              close: double.parse(l[4].toString()),
              volume: double.tryParse(l[5].toString()) ?? 0,
              closeTimeMs: ts,
            );
          }).toList(growable: false);

        case Exchange.bybit:
          final interval = _bybitInterval(tf);
          final url = Uri.parse('https://api.bybit.com/v5/market/kline?category=spot&symbol=$symbol&interval=$interval&limit=$limit');
          final r = await _client.get(url).timeout(const Duration(seconds: 10));
          if (r.statusCode != 200) return const [];
          final j = jsonDecode(r.body) as Map<String, dynamic>;
          final list = (j['result']?['list'] as List?) ?? const [];
          // Bybit: [startTime, open, high, low, close, volume, turnover]
          return list.map((e) {
            final l = e as List;
            final ts = int.tryParse(l[0].toString()) ?? 0;
            return Candle(
              openTimeMs: ts,
              open: double.parse(l[1].toString()),
              high: double.parse(l[2].toString()),
              low: double.parse(l[3].toString()),
              close: double.parse(l[4].toString()),
              volume: double.tryParse(l[5].toString()) ?? 0,
              closeTimeMs: ts,
            );
          }).toList(growable: false);
      }
    } catch (_) {
      return const [];
    }
  }

  Future<double?> _tryBitgetTickers(Uri url) async {
    try {
      final r = await _client.get(url).timeout(const Duration(seconds: 10));
      if (r.statusCode != 200) return null;
      final j = jsonDecode(r.body) as Map<String, dynamic>;
      final data = (j['data'] as List?) ?? const [];
      if (data.isEmpty) return null;
      final item = data.first as Map<String, dynamic>;
      return double.tryParse(item['lastPr']?.toString() ?? item['last']?.toString() ?? '');
    } catch (_) {
      return null;
    }
  }

  Future<double?> _tryBitgetTicker(Uri url) async {
    try {
      final r = await _client.get(url).timeout(const Duration(seconds: 10));
      if (r.statusCode != 200) return null;
      final j = jsonDecode(r.body) as Map<String, dynamic>;
      final data = (j['data'] as Map?) ?? {};
      return double.tryParse(data['lastPr']?.toString() ?? data['last']?.toString() ?? '');
    } catch (_) {
      return null;
    }
  }

  String _bitgetGranularity(Tf tf) {
    switch (tf) {
      case Tf.m15:
        return '15min';
      case Tf.h1:
        return '1h';
      case Tf.h4:
        return '4h';
      case Tf.d1:
        return '1day';
      case Tf.w1:
        return '1week';
      case Tf.m1:
        return '1month';
    }
  }

  String _bybitInterval(Tf tf) {
    switch (tf) {
      case Tf.m15:
        return '15';
      case Tf.h1:
        return '60';
      case Tf.h4:
        return '240';
      case Tf.d1:
        return 'D';
      case Tf.w1:
        return 'W';
      case Tf.m1:
        return 'M';
    }
  }
}
