class TradePlan {
  final String symbol;
  final String tf; // '5m','15m','1h'...
  final String direction; // 'LONG'|'SHORT'
  final double entry;
  final double sl;
  final List<double> tps; // [tp1,tp2,tp3]
  final double rr;
  final double evidenceScore;
  final String regime;
  final int createdAtMs;

  const TradePlan({
    required this.symbol,
    required this.tf,
    required this.direction,
    required this.entry,
    required this.sl,
    required this.tps,
    required this.rr,
    required this.evidenceScore,
    required this.regime,
    required this.createdAtMs,
  });
}

class TradeOutcome {
  final String result; // 'TP'|'SL'|'TIMEOUT'|'BE'|'CANCEL'
  final int closedAtMs;
  final double? closePrice;
  final double mae; // max adverse excursion (price distance)
  final double mfe; // max favorable excursion (price distance)
  final int tpHit; // 0..3
  const TradeOutcome({
    required this.result,
    required this.closedAtMs,
    required this.closePrice,
    required this.mae,
    required this.mfe,
    required this.tpHit,
  });
}