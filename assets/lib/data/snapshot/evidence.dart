enum EvidenceSide { long, short, neutral }

enum EvidenceKind { trend, momentum, flow, pattern, volatility, risk }

class Evidence {
  /// UI 표시용 라벨 (없으면 kind/tf로 자동 생성)
  String get label => (meta['label']?.toString().trim().isNotEmpty ?? false)
      ? meta['label'].toString()
      : '${kind.name.toUpperCase()}_${tf.toUpperCase()}';

  /// 방향(롱/숏/중립)
  EvidenceSide get side {
    if (score > 0.05) return EvidenceSide.long;
    if (score < -0.05) return EvidenceSide.short;
    return EvidenceSide.neutral;
  }


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
