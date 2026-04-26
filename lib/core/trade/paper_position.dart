import 'paper_journal.dart';

class PaperPosition {
  final String symbol;
  final bool isLong;
  final double qty; // BTC
  final double entry;
  final double mark;
  final double margin; // USDT
  final double liq; // USDT (estimate)
  final double leverage;
  final double pnl; // USDT
  final double roiPct; // %
  final double marginRatePct; // %
  final double? sl;
  final double? tp;

  const PaperPosition({
    required this.symbol,
    required this.isLong,
    required this.qty,
    required this.entry,
    required this.mark,
    required this.margin,
    required this.liq,
    required this.leverage,
    required this.pnl,
    required this.roiPct,
    required this.marginRatePct,
    this.sl,
    this.tp,
  });

  PaperPosition copyWith({
    double? mark,
    double? pnl,
    double? roiPct,
    double? marginRatePct,
    double? liq,
    double? sl,
    double? tp,
  }) {
    return PaperPosition(
      symbol: symbol,
      isLong: isLong,
      qty: qty,
      entry: entry,
      mark: mark ?? this.mark,
      margin: margin,
      liq: liq ?? this.liq,
      leverage: leverage,
      pnl: pnl ?? this.pnl,
      roiPct: roiPct ?? this.roiPct,
      marginRatePct: marginRatePct ?? this.marginRatePct,
      sl: sl ?? this.sl,
      tp: tp ?? this.tp,
    );
  }
}

class PaperTradeStore {
  static PaperPosition? _pos;
  static int? _openedAt;

  static PaperPosition? get position => _pos;

  static void open({
    required String symbol,
    required bool isLong,
    required double qty,
    required double entry,
    required double mark,
    required double leverage,
    required double riskPct, // 5% etc
    double? sl,
    double? tp,
  }) {
    final notional = qty * entry;
    final margin = notional / leverage;
    final pnl = (isLong ? (mark - entry) : (entry - mark)) * qty;
    final roi = margin <= 0 ? 0.0 : (pnl / margin) * 100.0;

    // ë§¤ìš° ?¨ìˆœ??ì²?‚°ê°€ ê·¼ì‚¬(?•í™• X): entry +/- entry/leverage*0.95
    final liq = isLong
        ? entry * (1.0 - (0.95 / leverage))
        : entry * (1.0 + (0.95 / leverage));

    final mr = margin <= 0 ? 0.0 : (margin / notional) * 100.0;

    _pos = PaperPosition(
      symbol: symbol,
      isLong: isLong,
      qty: qty,
      entry: entry,
      mark: mark,
      margin: margin,
      liq: liq,
      leverage: leverage,
      pnl: pnl,
      roiPct: roi,
      marginRatePct: mr,
      sl: sl,
      tp: tp,
    );
    _openedAt = DateTime.now().millisecondsSinceEpoch;
  }

  static void updateMark(double mark) {
    if (_pos == null) return;
    final p = _pos!;
    final pnl = (p.isLong ? (mark - p.entry) : (p.entry - mark)) * p.qty;
    final roi = p.margin <= 0 ? 0.0 : (pnl / p.margin) * 100.0;
    _pos = p.copyWith(mark: mark, pnl: pnl, roiPct: roi);

    // TP/SL ?ë™ ì²?‚°(?˜ì´??
    final sl = p.sl;
    final tp = p.tp;
    bool hitSl = false;
    bool hitTp = false;
    if (sl != null) {
      hitSl = p.isLong ? mark <= sl : mark >= sl;
    }
    if (tp != null) {
      hitTp = p.isLong ? mark >= tp : mark <= tp;
    }
    if (hitSl || hitTp) {
      final now = DateTime.now().millisecondsSinceEpoch;
      PaperTradeJournal.add(
        PaperTradeRecord(
          symbol: p.symbol,
          tf: 'AUTO',
          dir: p.isLong ? 'LONG' : 'SHORT',
          entry: p.entry,
          sl: p.sl ?? p.entry,
          tp: p.tp ?? p.entry,
          leverage: p.leverage.round(),
          qty: p.qty,
          openedAt: _openedAt ?? now,
          closedAt: now,
          result: hitTp ? 'WIN' : 'LOSS',
          exit: mark,
          pnl: pnl,
          roiPct: roi,
          evidenceHits: 0,
          evidenceNeed: 4,
        ),
      );
      close();
    }
  }

  static void close() {
    _pos = null;
  }
}
