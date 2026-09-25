
class FinalJudgementV2 {
  static String build({
    required double price,
    required double s1,
    required double r1,
    required int prob,
    required int winRate,
    required bool locked,
  }) {
    if (locked) {
      return '최근 연속 실패로 현재는 관망이 안전합니다.\n'
             'AI가 잠시 분석 기준을 강화했습니다.';
    }

    final nearSupport = price <= s1 * 1.01;
    final nearResist = price >= r1 * 0.99;

    if (nearSupport && prob >= 65) {
      return '가격이 지지선 근처입니다.\n'
             '반등 가능성이 있으며 신중한 롱 준비 구간입니다.\n'
             '손절은 지지 이탈 시 짧게 권장합니다.';
    }

    if (nearResist && prob <= 45) {
      return '가격이 저항선 근처입니다.\n'
             '되밀림 가능성이 있어 추격 매수는 피하세요.';
    }

    if (prob >= 70) {
      return '현재 흐름은 우호적입니다.\n'
             '확률이 높아 조건부 진입을 고려할 수 있습니다.';
    }

    return '뚜렷한 우위가 없습니다.\n'
           '지금은 기다리며 방향 확인이 필요합니다.';
  }
}
