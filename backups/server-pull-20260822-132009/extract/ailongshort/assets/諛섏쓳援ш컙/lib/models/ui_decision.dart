// lib/models/ui_decision.dart
/// (구버전 경로) 일부 파일에서 이 클래스를 import하는 경우가 있어
/// 런타임 크래시 방지를 위해 필요한 getter들을 모두 제공합니다.
///
/// 🚑 빌드 에러 대응: evidence 기본값 제공(옵션)

class UiDecision {
  final String title;
  final String detail;

  String get subtitle => detail;

  final bool locked;
  final int confidence;

  final Map<String, bool> evidence;
  final int evidenceHit;
  final int evidenceTotal;

  final Map<String, int> meters;

  const UiDecision({
    this.title = '관망',
    this.detail = 'LOCK',
    this.locked = true,
    this.confidence = 0,
    this.evidence = const <String, bool>{},
    this.evidenceHit = 0,
    this.evidenceTotal = 0,
    this.meters = const <String, int>{},
  });

  factory UiDecision.empty() => const UiDecision();

  factory UiDecision.fromJson(Map<String, dynamic> json) {
    final m = json['meters'];
    return UiDecision(
      title: (json['title'] ?? '').toString(),
      detail: (json['detail'] ?? json['subtitle'] ?? '').toString(),
      locked: (json['locked'] ?? false) == true,
      confidence: (json['confidence'] ?? 0) is num ? (json['confidence'] as num).toInt() : 0,
      evidence: (json['evidence'] is Map)
          ? Map<String, bool>.from((json['evidence'] as Map).map((k, v) => MapEntry(k.toString(), v == true)))
          : const <String, bool>{},
      evidenceHit: (json['evidenceHit'] ?? 0) is num ? (json['evidenceHit'] as num).toInt() : 0,
      evidenceTotal: (json['evidenceTotal'] ?? 0) is num ? (json['evidenceTotal'] as num).toInt() : 0,
      meters: (m is Map)
          ? Map<String, int>.from((m as Map).map((k, v) => MapEntry(k.toString(), (v is num) ? v.toInt() : 0)))
          : const <String, int>{},
    );
  }
}
