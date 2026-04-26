
class Evidence {
  final String id;
  final String vote;
  final double weight;
  final double strength;
  Evidence(this.id, this.vote, this.weight, this.strength);
}

class CoreAIResult {
  final String bias;
  final double longPct;
  final double shortPct;
  final double lockPct;
  CoreAIResult(this.bias, this.longPct, this.shortPct, this.lockPct);
}

class CoreAI {
  static CoreAIResult run(List<Evidence> evs) {
    double l=0, s=0;
    for (final e in evs) {
      if (e.vote=='LONG') l+=e.weight*e.strength;
      if (e.vote=='SHORT') s+=e.weight*e.strength;
    }
    final t=l+s;
    final lp = t==0 ? 0.0 : (l / t * 100.0).toDouble();
    final sp = t==0 ? 0.0 : (s / t * 100.0).toDouble();
    final kp = (100.0 - lp - sp).toDouble();
    final bias = (lp-sp).abs()<10 ? 'LOCK' : (lp>sp?'LONG':'SHORT');
    return CoreAIResult(bias, lp, sp, kp);
  }
}
