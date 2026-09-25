// lib/models/decision.dart

enum DecisionType { long, short, noTrade }

/// ✅ UltraEngine이 직접 호출하는 생성자: UiDecision(...)
/// UI(ultra_home_screen)에서 d.subtitle / d.meters / d.evidenceHit / d.evidenceTotal 을 참조하므로
/// 여기 모델에서 모두 제공해야 런타임 NoSuchMethodError가 나지 않습니다.
///
/// 🚑 빌드 에러 대응:
/// 기존 코드(ultra_engine/ultra_result)가 UiDecision(...) 호출 시 evidence를 안 넘기는 케이스가 있어
/// evidence를 required에서 optional + 기본값으로 변경.
class UiDecision {
  final String title;
  final String detail;

  /// UI 호환: 기존 코드가 subtitle을 요구
  String get subtitle => detail;

  final bool locked;

  /// 0..100
  final int confidence;

  /// evidence flags (ex: {'FVG': true, 'CVD': false})
  final Map<String, bool> evidence;

  /// number of matched evidences
  final int evidenceHit;

  /// total evidences considered
  final int evidenceTotal;

  /// UI meters (ex: {'위험도': 72, '쏠림·물량(급등락)': 55})
  final Map<String, int> meters;

  const UiDecision({
    required this.title,
    required this.detail,
    required this.locked,
    required this.confidence,

    /// ✅ optional w/ default (build-fix)
    this.evidence = const <String, bool>{},

    this.evidenceHit = 0,
    this.evidenceTotal = 0,
    this.meters = const <String, int>{},
  });

  factory UiDecision.empty() {
    return const UiDecision(
      title: '관망',
      detail: 'LOCK',
      locked: true,
      confidence: 0,
    );
  }

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

class Decision {
  final DecisionType type;
  final double confidence; // 0..1
  final String label;

  const Decision({
    required this.type,
    required this.confidence,
    required this.label,
  });

  bool get isLong => type == DecisionType.long;
  bool get isShort => type == DecisionType.short;
  bool get isNoTrade => type == DecisionType.noTrade;

  static const Decision noTrade =
      Decision(type: DecisionType.noTrade, confidence: 0, label: 'NO-TRADE');
}
