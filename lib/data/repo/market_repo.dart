import '../exchange/exchange_client.dart';
import '../exchange/bitget_client.dart';
import '../exchange/dto/candle_dto.dart';
import '../exchange/dto/ticker_dto.dart';
import '../local/dao/candle_dao.dart';
import '../../core/timeframe.dart';
import '../../core/logger.dart';
import '../../core/result.dart';

/// MarketRepo ??S-01 sync ?¤íŒ¨ ??Result.fail. S-14: ?•ë ¬/ì¤‘ë³µ/ê°?ì²˜ë¦¬, DB ?œê°„ ?? „ ?†ìŒ.
class MarketRepo {
  final ExchangeClient _client = BitgetClient();

  /// S-14: t ?¤ë¦„ì°¨ìˆœ ?•ë ¬, ?™ì¼ t ì¤‘ë³µ ?œê±° ??cleaned candles
  static List<CandleDto> cleanCandles(List<CandleDto> raw) {
    if (raw.isEmpty) return [];
    final sorted = List<CandleDto>.from(raw)..sort((a, b) => a.t.compareTo(b.t));
    final seen = <int>{};
    return sorted.where((c) => seen.add(c.t)).toList();
  }

  /// API -> clean -> DAO upsert. ?¤íŒ¨ ??Err(message), ?¬ë˜??ê¸ˆì?.
  Future<Result<String>> syncCandles(String symbol, Timeframe tf, int limit) async {
    try {
      final list = await _client.getKlines(symbol, tf.code, limit);
      if (list.isEmpty) return const Err('?™ê¸°???¤íŒ¨: ?°ì´???†ìŒ');
      final cleaned = cleanCandles(list);
      await CandleDao.upsertMany(symbol, tf.code, cleaned);
      log('syncCandles $symbol ${tf.code} ${cleaned.length}');
      return const Ok('');
    } catch (e) {
      logError('syncCandles', e);
      return Err(e.toString());
    }
  }

  /// DAO load ??S-14: ?•ë ¬/ì¤‘ë³µ ?œê±° ????ƒ ?œê°„ ?¤ë¦„ì°¨ìˆœ ë°˜í™˜ (DB???œê°„ ?? „ ?†ìŒ ë³´ì¥)
  Future<List<CandleDto>> getCandles(String symbol, Timeframe tf, int limit) async {
    final list = await CandleDao.loadRecent(symbol, tf.code, limit);
    final cleaned = cleanCandles(list);
    return cleaned;
  }

  /// ?„ì¬ê°€ (ticker). ?¤íŒ¨ ??null, ?¬ë˜??ê¸ˆì?.
  Future<TickerDto?> getLastPrice(String symbol) async {
    try {
      return await _client.getTicker(symbol);
    } catch (e) {
      logError('getLastPrice', e);
      return null;
    }
  }

}
