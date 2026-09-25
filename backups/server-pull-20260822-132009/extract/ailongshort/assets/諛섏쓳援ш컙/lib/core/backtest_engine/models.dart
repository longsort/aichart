class TradeRecord {
  final String direction; // LONG / SHORT
  final double entry;
  final double stop;
  final double target;
  final DateTime openTime;
  DateTime? closeTime;
  String result; // TP / SL / TIMEOUT

  TradeRecord({
    required this.direction,
    required this.entry,
    required this.stop,
    required this.target,
    required this.openTime,
    this.closeTime,
    this.result = 'OPEN',
  });
}

class BacktestStats {
  final int total;
  final int win;
  final int loss;
  final double winRate;
  BacktestStats(this.total, this.win, this.loss, this.winRate);
}
