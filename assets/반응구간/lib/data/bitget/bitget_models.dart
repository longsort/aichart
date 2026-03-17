// Bitget data models (shared across client/store/UI)

class BitgetTicker {
  final String symbol;
  final double last;
  final double change24hPct;
  final double quoteVolume24h;

  const BitgetTicker({
    required this.symbol,
    required this.last,
    required this.change24hPct,
    required this.quoteVolume24h,
  });
}
