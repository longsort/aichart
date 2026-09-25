class MarketTicker {
  final String symbol;
  final double last;
  final bool connected;
  final DateTime ts;

  const MarketTicker({
    required this.symbol,
    required this.last,
    required this.connected,
    required this.ts,
  });

  MarketTicker copyWith({
    String? symbol,
    double? last,
    bool? connected,
    DateTime? ts,
  }) {
    return MarketTicker(
      symbol: symbol ?? this.symbol,
      last: last ?? this.last,
      connected: connected ?? this.connected,
      ts: ts ?? this.ts,
    );
  }
}
