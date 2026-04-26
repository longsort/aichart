import 'package:dio/dio.dart';
import 'dto/candle_dto.dart';
import 'dto/ticker_dto.dart';
import 'exchange_client.dart';

/// Bitget API ?¥Îùº?¥Ïñ∏??(dio) ??S-01: ?¨Ïãú??2?? ?¨Îûò??Í∏àÏ?
class BitgetClient implements ExchangeClient {
  BitgetClient({Dio? dio}) : _dio = dio ?? Dio();

  final Dio _dio;
  static const _base = 'https://api.bitget.com';
  static const _retries = 2;
  static const _retryDelayMs = 400;

  static Future<void> _delay() => Future<void>.delayed(Duration(milliseconds: _retryDelayMs));

  @override
  Future<TickerDto?> getTicker(String symbol) async {
    for (var attempt = 0; attempt <= _retries; attempt++) {
      try {
        final res = await _dio.get('$_base/api/v2/mix/market/ticker', queryParameters: {'symbol': symbol});
        final data = res.data;
        if (data == null || data['data'] == null) continue;
        final d = data['data'] as Map<String, dynamic>;
        final last = d['lastPr'] ?? d['last'] ?? d['close'];
        if (last == null) continue;
        return TickerDto(symbol: symbol, lastPrice: (last is num ? last.toDouble() : double.tryParse(last.toString()) ?? 0));
      } catch (_) {
        if (attempt < _retries) await _delay();
      }
    }
    return null;
  }

  @override
  Future<List<CandleDto>> getKlines(String symbol, String timeframe, int limit) async {
    for (var attempt = 0; attempt <= _retries; attempt++) {
      try {
        final interval = _tfToInterval(timeframe);
        final res = await _dio.get('$_base/api/v2/mix/market/candles',
            queryParameters: {'symbol': symbol, 'granularity': interval, 'limit': limit.toString()});
        final data = res.data;
        if (data == null || data['data'] == null) continue;
        final list = data['data'] as List;
        final candles = list.map((e) {
          final arr = e as List;
          return CandleDto(
            t: int.tryParse(arr[0].toString()) ?? 0,
            o: _parseDouble(arr[1]),
            h: _parseDouble(arr[2]),
            l: _parseDouble(arr[3]),
            c: _parseDouble(arr[4]),
            v: _parseDouble(arr.length > 5 ? arr[5] : 0),
          );
        }).toList();
        candles.sort((a, b) => a.t.compareTo(b.t));
        return candles;
      } catch (_) {
        if (attempt < _retries) await _delay();
      }
    }
    return [];
  }

  static double _parseDouble(dynamic v) {
    if (v == null) return 0;
    if (v is num) return v.toDouble();
    return double.tryParse(v.toString()) ?? 0;
  }

  static String _tfToInterval(String tf) {
    switch (tf.toLowerCase()) {
      case 'm5':
        return '5m';
      case 'm15':
        return '15m';
      case 'h1':
        return '1H';
      case 'h4':
        return '4H';
      case 'd1':
        return '1D';
      case 'w1':
        return '1W';
      case 'mo1':
        return '1M';
      default:
        return '15m';
    }
  }
}
