import 'dto/candle_dto.dart';
import 'dto/ticker_dto.dart';

/// 거래소 클라이언트 인터페이스 — UI/Repo는 이 인터페이스만 의존
abstract class ExchangeClient {
  Future<TickerDto?> getTicker(String symbol);
  Future<List<CandleDto>> getKlines(String symbol, String timeframe, int limit);
}
