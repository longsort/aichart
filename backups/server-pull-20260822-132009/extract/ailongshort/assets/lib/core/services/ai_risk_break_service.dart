/// STEP 8: 오더북/체결/스프레드 기반
/// - 지지 가능성 / 돌파 가능성 / 스탑헌트 위험 점수화 + dto 주입
class AiRiskBreakService {
  static int _asInt(dynamic v, int fb) {
    if (v == null) return fb;
    if (v is int) return v;
    if (v is num) return v.round();
    if (v is String) return int.tryParse(v) ?? fb;
    return fb;
  }

  static String _asStr(dynamic v, String fb) =>
      (v is String && v.isNotEmpty) ? v : fb;

  /// dto에 쓰는 키:
  /// - supportP (0~100)
  /// - breakoutP (0~100)
  /// - stopHuntRiskP (0~100)
  /// - riskBadgeKR (문구)
  static void inject(Map<String, dynamic> dto) {
    final bias = _asStr(dto['orderbookBias'], '중립');
    final liq = _asStr(dto['liquidityRisk'], '보통');
    final spreadBp = _asInt(dto['spreadBp'], 3);
    final imb = _asInt(dto['orderbookImbalance'], 0);
    final buyP = _asInt(dto['fillsBuyP'], -1);
    final sellP = _asInt(dto['fillsSellP'], -1);

    // base
    int support = 55;
    int breakout = 50;
    int stopHunt = 30;

    // 오더북 편향
    if (bias == '매수우위') {
      support += 10;
      breakout += 8;
      stopHunt -= 2;
    } else if (bias == '매도우위') {
      support -= 6;
      breakout -= 4;
      stopHunt += 6;
    }

    // imbalance(%) → 강도 (clamp는 num 반환이라 int로 변환)
    support += ((imb / 6).clamp(-10, 10)).round();
    breakout += ((imb / 7).clamp(-8, 8)).round();

    // 스프레드가 넓으면 스탑헌트/슬리피지 위험 증가
    stopHunt += (((spreadBp - 3) * 2).clamp(-6, 18)).round();

    // 유동성 리스크
    if (liq == '낮음') {
      stopHunt -= 8;
      support += 4;
      breakout += 4;
    } else if (liq == '높음') {
      stopHunt += 15;
      support -= 8;
      breakout -= 6;
    }

    // 체결우위(있으면)
    if (buyP >= 0 && sellP >= 0) {
      final delta = (buyP - sellP);
      support += ((delta / 4).clamp(-12, 12)).round();
      breakout += ((delta / 5).clamp(-10, 10)).round();
      if (delta.abs() >= 18) stopHunt += 4; // 쏠림 심하면 헌트 가능성도 같이 증가
    }

    support = support.clamp(0, 100);
    breakout = breakout.clamp(0, 100);
    stopHunt = stopHunt.clamp(0, 100);

    String badge;
    if (stopHunt >= 70) {
      badge = '스탑헌트 위험 높음';
    } else if (breakout >= 70) {
      badge = '돌파 가능성 높음';
    } else if (support >= 70) {
      badge = '지지 가능성 높음';
    } else if (stopHunt >= 55) {
      badge = '변동성/헌트 주의';
    } else {
      badge = '평시';
    }

    dto['supportP'] = support;
    dto['breakoutP'] = breakout;
    dto['stopHuntRiskP'] = stopHunt;
    dto['riskBadgeKR'] = badge;
  }
}
