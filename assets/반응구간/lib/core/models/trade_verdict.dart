enum TradeAction { LONG, SHORT, WAIT, NO_TRADE }

/// 최종 1줄 결론(홈/전체화면 브리핑 공용)
/// - action: LONG/SHORT/WAIT/NO_TRADE
/// - title: 화면에 크게 보여줄 1줄(예: "롱 확정")
/// - reason: 한 줄 요약(예: "구간 74 · 구조 OK · TF 합의 OK")
class TradeVerdict {
  final TradeAction action;
  final String title;
  final String reason;

  const TradeVerdict({
    required this.action,
    required this.title,
    required this.reason,
  });
}
