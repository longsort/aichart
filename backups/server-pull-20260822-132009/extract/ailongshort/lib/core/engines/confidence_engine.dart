class ConfidenceInputs {
  final int tfAgree;       // 0~10
  final int whaleFlow;     // 0~10
  final int volume;        // 0~10
  final int closeQuality;  // 0~10
  const ConfidenceInputs({
    required this.tfAgree,
    required this.whaleFlow,
    required this.volume,
    required this.closeQuality,
  });
}

class ConfidenceEngine {
  // 0~100
  static int score(ConfidenceInputs i) {
    int s = 0;
    s += i.tfAgree * 4;       // 40
    s += i.whaleFlow * 2;     // 20
    s += i.volume * 2;        // 20
    s += i.closeQuality * 2;  // 20
    if (s > 100) s = 100;
    if (s < 0) s = 0;
    return s;
  }

  static String label(int score) {
    if (score >= 80) return 'ë§¤ìš° ?’ìŒ';
    if (score >= 65) return '?’ìŒ';
    if (score >= 50) return 'ë³´í†µ';
    if (score >= 35) return '??Œ';
    return 'ë§¤ìš° ??Œ';
  }
}
