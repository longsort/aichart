class Candle {
  Candle({
    required this.openTimeMs,
    required this.open,
    required this.high,
    required this.low,
    required this.close,
    required this.volume,
    required this.closeTimeMs,
  });

  final int openTimeMs;
  final double open;
  final double high;
  final double low;
  final double close;
  final double volume;
  final int closeTimeMs;

  bool get isBull => close >= open;
}
