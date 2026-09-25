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
    return '지금은 거래를 피하세요. 세력 유인 가능성이 감지되었습니다.';
  }

  if (input.state == 'WAIT') {
    return '아직 확실한 근거가 부족합니다. 관망이 유리합니다.';
  }

  final dir = input.state == 'LONG' ? '상승' : '하락';
  return '현재 $dir 가능성이 ${input.probability}%로 우세합니다. '
         '${input.whaleNote} '
         '리스크 관리: ${input.riskNote}';
}
