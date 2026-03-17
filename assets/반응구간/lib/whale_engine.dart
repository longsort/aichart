class WhaleState {
  final double cvd;        // -1 ~ +1
  final double volume;     // 0 ~ 1
  final bool accumulation;
  final bool distribution;
  WhaleState(this.cvd, this.volume, this.accumulation, this.distribution);
}

class WhaleEngine {
  WhaleState analyze(double cvd, double volume) {
    final acc = cvd > 0.35 && volume > 0.55;
    final dis = cvd < -0.35 && volume > 0.55;
    return WhaleState(cvd, volume, acc, dis);
  }
}
