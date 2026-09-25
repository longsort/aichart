
class TradeLog {
  final String symbol;
  final String direction; // "buy" / "sell" / "none"
  final double entry;
  final double exit;
  final bool win;
  final DateTime time;

  /// Optional: store evidence/hints for stats (e.g. "BPR2", "PO3", "Flow")
  final Map<String, dynamic> meta;

  TradeLog(
    this.symbol,
    this.direction,
    this.entry,
    this.exit,
    this.win,
    this.time, {
    this.meta = const {},
  });
}
