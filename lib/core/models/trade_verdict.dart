enum TradeAction { LONG, SHORT, WAIT, NO_TRADE }

/// ìµœì¢… 1ì¤?ê²°ë¡ (???„ì²´?”ë©´ ë¸Œë¦¬??ê³µìš©)
/// - action: LONG/SHORT/WAIT/NO_TRADE
/// - title: ?”ë©´???¬ê²Œ ë³´ì—¬ì¤?1ì¤??? "ë¡??•ì •")
/// - reason: ??ì¤??”ì•½(?? "êµ¬ê°„ 74 Â· êµ¬ì¡° OK Â· TF ?©ì˜ OK")
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
