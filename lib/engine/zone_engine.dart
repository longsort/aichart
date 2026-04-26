
class Zone {
  final double low;
  final double high;
  final String type; // support / resistance
  final double probability;

  Zone(this.low, this.high, this.type, this.probability);
}

class ZoneEngine {
  static Zone buildCoreSupport(List<double> lows) {
    final low = lows.reduce((a,b)=>a<b?a:b);
    return Zone(low*0.997, low*1.003, 'support', _calcProb(lows));
  }

  static Zone buildCoreResistance(List<double> highs) {
    final high = highs.reduce((a,b)=>a>b?a:b);
    return Zone(high*0.997, high*1.003, 'resistance', _calcProb(highs));
  }

  static double _calcProb(List<double> samples) {
    if (samples.length < 5) return 0.5;
    return (samples.length / (samples.length + 5)).clamp(0.3, 0.9);
  }
}
