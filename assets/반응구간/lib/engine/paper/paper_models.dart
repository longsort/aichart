class PaperPosition {
  final String dir; // '상승' | '하락'
  final double entry;
  final double sl;
  final List<double> tps;
  final double sizeUsd;
  final double leverage;
  final DateTime openedAt;

  const PaperPosition({
    required this.dir,
    required this.entry,
    required this.sl,
    required this.tps,
    required this.sizeUsd,
    required this.leverage,
    required this.openedAt,
  });

  /// 하위 호환: 단일 tp
  double get tp => tps.isNotEmpty ? tps.first : entry;
}

class PaperResult {
  final DateTime ts;
  final String dir;
  final double entry;
  final double exit;
  final String outcome; // '성공' | '실패' | '시간초과'
  final double pnlUsd;
  final int evidenceHit;
  final int evidenceTotal;

  const PaperResult({
    required this.ts,
    required this.dir,
    required this.entry,
    required this.exit,
    required this.outcome,
    required this.pnlUsd,
    required this.evidenceHit,
    required this.evidenceTotal,
  });

  /// 하위 호환
  bool get win => outcome == '성공';
  double get pnl => pnlUsd;
}
