class AiCommentService {
  static int _asInt(dynamic v, int fb) {
    if (v == null) return fb;
    if (v is int) return v;
    if (v is num) return v.round();
    if (v is String) return int.tryParse(v) ?? fb;
    return fb;
  }

  static String _asStr(dynamic v, String fb) =>
      (v is String && v.isNotEmpty) ? v : fb;

  /// STEP11: 사용자에게 보여줄 "한 줄 코멘트" 생성
  /// dto에서 가능한 값들:
  /// - decisionLabel/decision, confidence
  /// - orderbookBias, liquidityRisk, spreadBp
  /// - supportP, breakoutP, stopHuntRiskP, riskBadgeKR
  /// - structureScore, patternScore (있으면)
  static String build(Map<String, dynamic> dto) {
    final decision = _asStr(dto['decisionLabel'] ?? dto['decision'], '관망');
    final conf = _asInt(dto['confidence'], 55);

    final bias = _asStr(dto['orderbookBias'], '중립');
    final liq = _asStr(dto['liquidityRisk'], '보통');
    final spreadBp = _asInt(dto['spreadBp'], 0);

    final support = _asInt(dto['supportP'], 0);
    final breakout = _asInt(dto['breakoutP'], 0);
    final hunt = _asInt(dto['stopHuntRiskP'], 0);
    final badge = _asStr(dto['riskBadgeKR'], '');

    final struct = _asInt(dto['structureScore'], -1);
    final patt = _asInt(dto['patternScore'], -1);

    // 핵심 위험 우선
    if (hunt >= 70 || badge.contains('스탑헌트')) {
      return '결론: $decision ($conf%) · 스탑헌트 위험↑(헌트 $hunt%) → 무리한 진입 금지';
    }
    if (liq.contains('높') || spreadBp >= 7) {
      return '결론: $decision ($conf%) · 유동성 리스크/스프레드↑(${spreadBp}bp) → 슬리피지 주의';
    }

    // 방향성 코멘트
    if (decision.contains('매수')) {
      final k1 = breakout >= 65 ? '돌파 우세' : (support >= 65 ? '지지 우세' : '초입');
      final k2 = bias == '매수우위' ? '체결/오더북 매수우위' : '오더북 중립';
      return '결론: 매수 ($conf%) · $k1($breakout/$support) · $k2 · 리스크 $hunt%';
    }
    if (decision.contains('매도')) {
      final k1 = bias == '매도우위' ? '체결/오더북 매도우위' : '오더북 중립';
      final k2 = hunt >= 55 ? '헌트 주의' : '리스크 낮음';
      return '결론: 매도 ($conf%) · $k1 · $k2 · 스프레드 ${spreadBp}bp';
    }

    // 관망 코멘트(근거 부족)
    final sTxt = struct >= 0 ? '구조 $struct' : '구조 ?';
    final pTxt = patt >= 0 ? '패턴 $patt' : '패턴 ?';
    final hint = (breakout >= 65 || support >= 65)
        ? '조건 대기(확정 시 진입)'
        : '근거 부족(관망)';
    return '결론: 관망 ($conf%) · $sTxt/$pTxt · 오더북 $bias · $hint';
  }
}
