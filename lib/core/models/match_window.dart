class MatchWindow {
  final int start;
  final int end;
  final double similarity; // 0~1
  final double fwdReturn;  // %
  const MatchWindow({
    required this.start,
    required this.end,
    required this.similarity,
    required this.fwdReturn,
  });
}
