import '../models/candle.dart';
import 'bitget_public_api.dart';
import 'realtime_candle_repo.dart';

/// Í∏∞Ï°¥ UltraHomeScreen?êÏÑú BitgetRealtimeCandleRepo() Î¨¥Ïù∏???∏Ï∂ú???†Ï??òÍ∏∞ ?ÑÌï¥
/// api ?åÎùºÎØ∏ÌÑ∞???†ÌÉù(optional)Î°??êÍ≥† Í∏∞Î≥∏Í∞?BitgetPublicApi())???¨Ïö©?©Îãà??
class BitgetRealtimeCandleRepo implements RealtimeCandleRepo {
  final BitgetPublicApi api;
  final String productType;

  BitgetRealtimeCandleRepo({BitgetPublicApi? api, this.productType = 'USDT-FUTURES'})
      : api = api ?? const BitgetPublicApi();

  String _g(String tf) {
    switch (tf) {
      case '5m':
        return '5m';
      case '15m':
        return '15m';
      case '1h':
        return '1H';
      case '4h':
        return '4H';
      case '1D':
        return '1D';
      case '1W':
        return '1W';
      case '1M':
        return '1M';
      default:
        return tf;
    }
  }

  @override
  Future<List<Candle>> fetch({required String symbol, required String tf, required int limit}) async {
    final raw = await api.candles(
      symbol: symbol,
      granularity: _g(tf),
      limit: limit,
      productType: productType,
    );

    raw.sort((a, b) => a[0].compareTo(b[0]));

    return raw.map((e) {
      final ts = e[0].toInt();
      final dt = DateTime.fromMillisecondsSinceEpoch(ts, isUtc: true).toLocal();
      return Candle(
        t: dt,
        o: e[1].toDouble(),
        h: e[2].toDouble(),
        l: e[3].toDouble(),
        c: e[4].toDouble(),
        v: e[5].toDouble(),
      );
    }).toList();
  }
}
