class TradeJournalItem {
  final DateTime time;
  final String symbol;
  final String tf;
  final String action; // 진입/관�?금�?
  final String side;   // �???중립
  final double entry;
  final double stop;
  final List<double> targets;
  final int confidence;
  final String reason;

  const TradeJournalItem({
    required this.time,
    required this.symbol,
    required this.tf,
    required this.action,
    required this.side,
    required this.entry,
    required this.stop,
    required this.targets,
    required this.confidence,
    required this.reason,
  });

  Map<String, dynamic> toJson() => {
    'time': time.toIso8601String(),
    'symbol': symbol,
    'tf': tf,
    'action': action,
    'side': side,
    'entry': entry,
    'stop': stop,
    'targets': targets,
    'confidence': confidence,
    'reason': reason,
  };
}
