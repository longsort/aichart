enum ProfitMode { off, safe, profit }

class ProfitConfig {
  static ProfitMode mode = ProfitMode.profit;

  // 수익모드: WAIT 금지 -> 최소 신호 빈도 가드
  static int minSignalsPerDay = 3;

  // 확정 최소 RR
  static double minRR = 1.5;

  // 저확신 진입 사이즈(비율)
  static double lowSize = 0.30;

  // 고확신 진입 사이즈(비율)
  static double highSize = 1.00;

  // 레버리지 캡
  static int maxLev = 20;

  // 강제 신호: 존 히트면 무조건 후보
  static bool forceOnZoneHit = true;
}
