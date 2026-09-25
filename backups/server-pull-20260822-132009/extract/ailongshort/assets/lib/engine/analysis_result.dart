
class AnalysisResult {
  final String conclusion; // 롱 / 숏 / 관망
  final String strength;   // STRONG / MID / WEAK
  final int hit;
  final int total;
  final String reason;

  AnalysisResult({
    required this.conclusion,
    required this.strength,
    required this.hit,
    required this.total,
    required this.reason,
  });
}
