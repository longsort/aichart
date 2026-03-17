/// 거래소 티커(현재가) 응답 DTO
class TickerDto {
  final String symbol;
  final double lastPrice;

  TickerDto({required this.symbol, required this.lastPrice});
}
