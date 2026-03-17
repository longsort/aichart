class AiActionService {
  /// dto(Map) 기반으로 사용자에게 보여줄 "자동 트리거" 문장을 만든다.
  /// - 엔진이 아직 완성되지 않아도 UI가 깨지지 않도록 매우 보수적으로 작성
  static List<String> buildTriggers(Map<String, dynamic> dto) {
    final String decision = (dto['decisionText'] ?? dto['decision'] ?? '관망').toString();
    final int conf = _toInt(dto['confidencePct'] ?? dto['confidence'] ?? 0);
    final int risk = _toInt(dto['riskPct'] ?? dto['risk'] ?? 0);
    final int evidence = _toInt(dto['evidenceCount'] ?? dto['evidence'] ?? 0);

    final List<String> out = [];

    // 1) NO-TRADE 우선
    if (decision.contains('NO-TRADE') || risk >= 80) {
      out.add('자동잠금: NO-TRADE (리스크 과다)');
      out.add('트리거: 리스크 60% 이하로 내려오면 해제');
      return out;
    }

    // 2) 방향 트리거
    if (decision.contains('매수') || decision.contains('LONG')) {
      if (conf >= 60 && risk <= 50 && evidence >= 3) {
        out.add('트리거: 단기 매수 후보 (조건 충족)');
      } else {
        out.add('트리거: 매수 Watch (근거 부족/리스크 확인)');
      }
    } else if (decision.contains('매도') || decision.contains('SHORT')) {
      if (conf >= 60 && risk <= 50 && evidence >= 3) {
        out.add('트리거: 단기 매도 후보 (조건 충족)');
      } else {
        out.add('트리거: 매도 Watch (근거 부족/리스크 확인)');
      }
    } else {
      out.add('트리거: 관망 (방향 불명확)');
    }

    // 3) 공통 가드
    if (conf < 50) {
      out.add('가드: 확신도 50% 미만 → 진입 금지');
    }
    if (evidence < 3) {
      out.add('가드: 근거 3개 미만 → Watch로 유지');
    }
    if (risk >= 60) {
      out.add('가드: 리스크 60%+ → 레버리지 축소');
    }

    return out;
  }

  static int _toInt(Object? v) {
    if (v == null) return 0;
    if (v is int) return v;
    if (v is double) return v.round();
    if (v is num) return v.round();
    return int.tryParse(v.toString()) ?? 0;
  }
}
