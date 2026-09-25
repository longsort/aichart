import 'ai_weights.dart';

class AiInputs {
  final String symbol;
  final String tf;

  final bool engulfBull;
  final bool engulfBear;

  final double bodyToAtr;
  final double volSpikeZ;
  final double cvdDelta;

  final bool liquiditySweep;
  final bool trendUp;
  final bool trendDown;

  final double fundingSkew;

  final double? zoneHigh;
  final double? zoneLow;

  const AiInputs({
    required this.symbol,
    required this.tf,
    required this.engulfBull,
    required this.engulfBear,
    required this.bodyToAtr,
    required this.volSpikeZ,
    required this.cvdDelta,
    required this.liquiditySweep,
    required this.trendUp,
    required this.trendDown,
    required this.fundingSkew,
    this.zoneHigh,
    this.zoneLow,
  });
}

class AiOutputs {
  final String decision;
  final bool engulfMode;
  final double upProb01;
  final double downProb01;
  final double buyPressure01;
  final double sellPressure01;
  final String lockReason;
  final String topReason;

  final double? zoneHigh;
  final double? zoneLow;
  final String? zoneTf;

  const AiOutputs({
    required this.decision,
    required this.engulfMode,
    required this.upProb01,
    required this.downProb01,
    required this.buyPressure01,
    required this.sellPressure01,
    required this.lockReason,
    required this.topReason,
    required this.zoneHigh,
    required this.zoneLow,
    required this.zoneTf,
  });
}

class AiEngine {
  static AiOutputs compute(AiInputs i, {AiWeights w = AiWeights.def}) {
    double clamp01(double x) => x < 0 ? 0 : (x > 1 ? 1 : x);

    final engulfScore = i.engulfBull ? 1.0 : (i.engulfBear ? 0.0 : 0.5);
    final bodyScore = clamp01((i.bodyToAtr - 0.6) / 1.2);
    final volScore = clamp01(i.volSpikeZ / 3.0);
    final cvdScore = clamp01((i.cvdDelta + 1) / 2);
    final sweepScore = i.liquiditySweep ? 0.35 : 0.5;
    final trendScore = i.trendUp ? 0.75 : (i.trendDown ? 0.25 : 0.5);
    final fundingScore = clamp01(0.5 - i.fundingSkew * 0.35);

    final totalW = (w.wEngulf + w.wBodyAtr + w.wVolSpike + w.wCvd + w.wSweep + w.wTrend + w.wFunding);
    final blend =
        (engulfScore * w.wEngulf +
            bodyScore * w.wBodyAtr +
            volScore * w.wVolSpike +
            cvdScore * w.wCvd +
            sweepScore * w.wSweep +
            trendScore * w.wTrend +
            fundingScore * w.wFunding) /
        (totalW == 0 ? 1 : totalW);

    final up = clamp01(blend);
    final down = clamp01(1 - blend);

    final buy = clamp01(0.40 +
        0.35 * (cvdScore - 0.5) +
        0.25 * (volScore - 0.5) +
        (i.engulfBull ? 0.08 : 0) -
        (i.engulfBear ? 0.08 : 0));
    final sell = clamp01(1 - buy);

    String decision = "NO-TRADE";
    String lockReason = "";
    String topReason = "";

    final confidence = (up - down).abs();
    if (up < w.lockThreshold && down < w.lockThreshold) {
      decision = "NO-TRADE";
      lockReason = "LOW_CONF";
    } else if (confidence < 0.14) {
      decision = "NO-TRADE";
      lockReason = "CHOP";
    } else if (up >= w.longThreshold && buy >= 0.52) {
      decision = "LONG";
    } else if (down >= w.shortThreshold && sell >= 0.52) {
      decision = "SHORT";
    } else {
      decision = "NO-TRADE";
      lockReason = "FILTER";
    }

    if (i.engulfBull) topReason = "ENGULF_BULL";
    else if (i.engulfBear) topReason = "ENGULF_BEAR";
    else if (volScore > 0.75) topReason = "VOL_SPIKE";
    else if ((cvdScore - 0.5).abs() > 0.25) topReason = "CVD_SHIFT";
    else if (i.liquiditySweep) topReason = "SWEEP_RISK";
    else if (i.trendUp || i.trendDown) topReason = "REGIME";
    else topReason = "MIX";

    return AiOutputs(
      decision: decision,
      engulfMode: i.engulfBull || i.engulfBear,
      upProb01: up,
      downProb01: down,
      buyPressure01: buy,
      sellPressure01: sell,
      lockReason: lockReason,
      topReason: topReason,
      zoneHigh: i.zoneHigh,
      zoneLow: i.zoneLow,
      zoneTf: i.tf,
    );
  }
}
