class BriefingInput {
  final String state; // LONG / SHORT / WAIT / BLOCK
  final int probability;
  final String whaleNote;
  final String riskNote;

  BriefingInput({
    required this.state,
    required this.probability,
    required this.whaleNote,
    required this.riskNote,
  });
}

String makeBriefing(BriefingInput input) {
  if (input.state == 'BLOCK') {
    return 'ì§€ê¸ˆì? ê±°ë˜ë¥??¼í•˜?¸ìš”. ?¸ë ¥ ? ì¸ ê°€?¥ì„±??ê°ì??˜ì—ˆ?µë‹ˆ??';
  }

  if (input.state == 'WAIT') {
    return '?„ì§ ?•ì‹¤??ê·¼ê±°ê°€ ë¶€ì¡±í•©?ˆë‹¤. ê´€ë§ì´ ? ë¦¬?©ë‹ˆ??';
  }

  final dir = input.state == 'LONG' ? '?ìŠ¹' : '?˜ë½';
  return '?„ì¬ $dir ê°€?¥ì„±??${input.probability}%ë¡??°ì„¸?©ë‹ˆ?? '
         '${input.whaleNote} '
         'ë¦¬ìŠ¤??ê´€ë¦? ${input.riskNote}';
}
