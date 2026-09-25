enum EvidenceKind { trend, momentum, flow, pattern, volatility, risk }

class Evidence {
  final String id;
  final EvidenceKind kind;
  final String tf;
  final double score;      // -1..+1
  final double weight;     // 0..1
  final double confidence; // 0..1
  final Map<String, dynamic> meta;

  const Evidence({
    required this.id,
    required this.kind,
    required this.tf,
    required this.score,
    this.weight = 1.0,
    this.confidence = 0.7,
    this.meta = const {},
  });
}
