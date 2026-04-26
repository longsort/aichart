class TradePlan {
  final String symbol;
  final String side; // 'LONG' | 'SHORT' | 'NONE'
  final double price; // current price snapshot when plan was made
  final double entry;
  final double sl;
  final double tp;
  final int evidenceHit;
  final int evidenceTotal;
  final int tfOk; // 0..6
  final int tfTotal; // 6
  final int createdMs;

  const TradePlan({
    required this.symbol,
    required this.side,
    required this.price,
    required this.entry,
    required this.sl,
    required this.tp,
    required this.evidenceHit,
    required this.evidenceTotal,
    required this.tfOk,
    required this.tfTotal,
    required this.createdMs,
  });

  static TradePlan none({String symbol = 'BTCUSDT'}) => TradePlan(
        symbol: symbol,
        side: 'NONE',
        price: 0,
        entry: 0,
        sl: 0,
        tp: 0,
        evidenceHit: 0,
        evidenceTotal: 0,
        tfOk: 0,
        tfTotal: 6,
        createdMs: 0,
      );

  bool get isValid => entry > 0 && sl > 0 && tp > 0 && side != 'NONE';
  Map<String, dynamic> toJson() => {
        'symbol': symbol,
        'side': side,
        'price': price,
        'entry': entry,
        'sl': sl,
        'tp': tp,
        'evidenceHit': evidenceHit,
        'evidenceTotal': evidenceTotal,
        'tfOk': tfOk,
        'tfTotal': tfTotal,
        'createdMs': createdMs,
      };
}
