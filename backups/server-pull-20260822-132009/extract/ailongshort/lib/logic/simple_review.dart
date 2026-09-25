class SimpleReview {
  /// outcome: WIN / LOSS / BE
  static String oneLine({
    required String outcome,
    required String symbol,
    required String tf,
    required String side,
    required int prob,
  }) {
    final o = outcome.toUpperCase();
    if (o == 'WIN') return '??$symbol $tf $side WIN 路 ?曤 $prob% ??瓿勴殟?�搿?';
    if (o == 'LOSS') return '??$symbol $tf $side LOSS 路 ?曤 $prob% ??氍错毃/?愳爤 欷�???愱?.';
    if (o == 'BE') return '??$symbol $tf $side BE 路 ?曤 $prob% ???犽Г, ?れ潓??歃濌卑 ??氇溂旮?';
    return '?摑 $symbol $tf $side $o 路 ?曤 $prob%';
  }
}
