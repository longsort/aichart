class AiWeights {
  final double wEngulf;
  final double wBodyAtr;
  final double wVolSpike;
  final double wCvd;
  final double wSweep;
  final double wTrend;
  final double wFunding;

  final double lockThreshold;
  final double longThreshold;
  final double shortThreshold;

  const AiWeights({
    this.wEngulf = 0.22,
    this.wBodyAtr = 0.12,
    this.wVolSpike = 0.12,
    this.wCvd = 0.18,
    this.wSweep = 0.14,
    this.wTrend = 0.14,
    this.wFunding = 0.08,
    this.lockThreshold = 0.54,
    this.longThreshold = 0.66,
    this.shortThreshold = 0.66,
  });

  static const AiWeights def = AiWeights();
}
