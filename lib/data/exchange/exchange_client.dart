import 'dto/candle_dto.dart';
import 'dto/ticker_dto.dart';

/// κ±°λ???΄λΌ?΄μ–Έ???Έν„°?μ΄????UI/Repo?????Έν„°?μ΄?¤λ§ ?μ΅΄
abstract class ExchangeClient {
  Future<TickerDto?> getTicker(String symbol);
  Future<List<CandleDto>> getKlines(String symbol, String timeframe, int limit);
}
