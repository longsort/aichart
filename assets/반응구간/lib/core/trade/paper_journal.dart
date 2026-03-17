/// 페이퍼 매매 기록(가상 자동매매)
/// - 컴파일 안정성을 최우선으로 “최소 계약”만 유지
/// - 추후 통계/가중치 보정 로직은 여기 records 기반으로 확장

class PaperTradeRecord {
  final String symbol;
  final String tf;
  final String dir; // LONG / SHORT
  final double entry;
  final double sl;
  final double tp;
  final int leverage;
  final double qty;
  final int openedAt;
  final int closedAt;
  final String result; // WIN / LOSS / TIMEOUT

  // 종료 정보
  final double exit;
  final double pnl; // USDT
  final double roiPct; // %

  // 엔진 보정용 메타
  final int evidenceHits;
  final int evidenceNeed;

  const PaperTradeRecord({
    required this.symbol,
    required this.tf,
    required this.dir,
    required this.entry,
    required this.sl,
    required this.tp,
    required this.leverage,
    required this.qty,
    required this.openedAt,
    required this.closedAt,
    required this.result,
    required this.exit,
    required this.pnl,
    required this.roiPct,
    required this.evidenceHits,
    required this.evidenceNeed,
  });
}

class PaperTradeJournal {
  static final List<PaperTradeRecord> records = <PaperTradeRecord>[];

  static void add(PaperTradeRecord r) {
    records.add(r);
    // 메모리 폭주 방지(최근 500건 유지)
    if (records.length > 500) {
      records.removeRange(0, records.length - 500);
    }
  }

  static int wins() => records.where((e) => e.result == 'WIN').length;
  static int losses() => records.where((e) => e.result == 'LOSS').length;
  static double winRate01({int lastN = 50}) {
    if (records.isEmpty) return 0;
    final sub = records.length <= lastN ? records : records.sublist(records.length - lastN);
    final w = sub.where((e) => e.result == 'WIN').length;
    return w / sub.length;
  }
}
