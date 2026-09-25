class Candle {
  final int tsMs;
  final double open;
  final double high;
  final double low;
  final double close;
  final double volume;
  final double turnover;

  const Candle({
    required this.tsMs,
    required this.open,
    required this.high,
    required this.low,
    required this.close,
    required this.volume,
    required this.turnover,
  });

  factory Candle.fromArray(List<dynamic> arr) {
    // Bitget v3 candles: [ts, open, high, low, close, volume, turnover] as strings
    double d(dynamic x) => (x is num) ? x.toDouble() : double.parse(x.toString());
    int i(dynamic x) => (x is int) ? x : int.parse(x.toString());
    return Candle(
      tsMs: i(arr[0]),
      open: d(arr[1]),
      high: d(arr[2]),
      low: d(arr[3]),
      close: d(arr[4]),
      volume: d(arr[5]),
      turnover: d(arr[6]),
    );
  }
}
