import 'models.dart';

class RiskConfig {
  static double baseRisk = 0.05; // 5%
  static double counterRisk = 0.03; // ??¶”??3%
  static double maxLeverage = 50.0;
}

RiskResult calcRisk(RiskInput input) {
  final risk = input.counterTrend ? RiskConfig.counterRisk : RiskConfig.baseRisk;

  if (input.stopPct <= 0) {
    return RiskResult(0, 0, '?ì ˆ???¤ë¥˜');
  }

  double lev = (risk / input.stopPct);
  if (lev > RiskConfig.maxLeverage) lev = RiskConfig.maxLeverage;

  return RiskResult(
    risk,
    double.parse(lev.toStringAsFixed(1)),
    input.counterTrend ? '??¶”??ë¦¬ìŠ¤??ì¶•ì†Œ' : '?•ë°©??ë¦¬ìŠ¤???ìš©',
  );
}
