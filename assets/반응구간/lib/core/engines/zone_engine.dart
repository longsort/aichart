class ZoneResult {
  final double valid;   // 유효(지지) 기준
  final double invalid; // 무효(손절) 기준
  final List<double> targets; // 목표 1/2/3
  const ZoneResult(this.valid, this.invalid, this.targets);
}

class ZoneEngine {
  // 단순 ATR 기반 구간 (추후 고도화: FVG/OB/유동성 반영)
  static ZoneResult build({
    required double price,
    required double atr,
    double invalidMul = 1.8,
  }) {
    final valid = price - atr;
    final invalid = price - atr * invalidMul;
    final targets = <double>[
      price + atr,
      price + atr * 2,
      price + atr * 3,
    ];
    return ZoneResult(valid, invalid, targets);
  }

  static String scenarioText(ZoneResult z) {
    return '유효 ${z.valid.round()} · 무효 ${z.invalid.round()} · 목표 ${z.targets[0].round()}/${z.targets[1].round()}/${z.targets[2].round()}';
  }
}
