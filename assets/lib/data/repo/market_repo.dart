import '../exchange/exchange_client.dart';
import '../exchange/bitget_client.dart';
import '../exchange/dto/candle_dto.dart';
import '../exchange/dto/ticker_dto.dart';
import '../local/dao/candle_dao.dart';
import '../../core/timeframe.dart';
import '../../core/logger.dart';
import '../../core/result.dart';

/// MarketRepo — S-01 sync 실패 시 Result.fail. S-14: 정렬/중복/갭 처리, DB 시간 역전 없음.
class MarketRepo {
  final ExchangeClient _client = BitgetClient();

  /// S-14: t 오름차순 정렬, 동일 t 중복 제거 → cleaned candles
  static List<CandleDto> cleanCandles(List<CandleDto> raw) {
    if (raw.isEmpty) return [];
    final sorted = List<CandleDto>.from(raw)..sort((a, b) => a.t.compareTo(b.t));
    final seen = <int>{};
    return sorted.where((c) => seen.add(c.t)).toList();
  }

  /// API -> clean -> DAO upsert. 실패 시 Err(message), 크래시 금지.
  Future<Result<String>> syncCandles(String symbol, Timeframe tf, int limit) async {
    try {
      final list = await _client.getKlines(symbol, tf.code, limit);
      if (list.isEmpty) return const Err('동기화 실패: 데이터 없음');
      final cleaned = cleanCandles(list);
      await CandleDao.upsertMany(symbol, tf.code, cleaned);
      log('syncCandles $symbol ${tf.code} ${cleaned.length}');
      return const Ok('');
    } catch (e) {
      logError('syncCandles', e);
      return Err(e.toString());
    }
  }

  /// DAO load — S-14: 정렬/중복 제거 후 항상 시간 오름차순 반환 (DB에 시간 역전 없음 보장)
  Future<List<CandleDto>> getCandles(String symbol, Timeframe tf, int limit) async {
    final list = await CandleDao.loadRecent(symbol, tf.code, limit);
    final cleaned = cleanCandles(list);
    return cleaned;
  }

  /// 현재가 (ticker). 실패 시 null, 크래시 금지.
  Future<TickerDto?> getLastPrice(String symbol) async {
    try {
      return await _client.getTicker(symbol);
    } catch (e) {
      logError('getLastPrice', e);
      return null;
    }
  }

}
