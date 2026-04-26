class AiMtfConsensusService {
  static Map<String, dynamic> build(Map<String, dynamic> dto) {
    final tfs = ['5m','15m','1h','4h','1d','1w','1m','1y'];
    int up=0, down=0, wait=0, sum=0;

    for (final tf in tfs) {
      final d = dto['decision_$tf'];
      final c = dto['confidence_$tf'];
      if (d is! String || c is! int) continue;
      sum += c;
      if (d.contains('ë§¤ìˆ˜')) up += c;
      else if (d.contains('ë§¤ë„')) down += c;
      else wait += c;
    }

    if (sum == 0) {
      return {
        'mtfLabel':'?¨ì¼ TF',
        'mtfP': dto['confidence'] ?? 0,
        'mtfDir': dto['decision'] ?? 'ê´€ë§?
      };
    }

    final maxV = [up,down,wait].reduce((a,b)=>a>b?a:b);
    String dir = maxV==up?'?ë°© ?©ì˜':maxV==down?'?˜ë°© ?©ì˜':'?¼ì¡°';
    final p = (maxV/sum*100).round();

    return {'mtfLabel':dir,'mtfP':p,'mtfDir':dir};
  }
}
