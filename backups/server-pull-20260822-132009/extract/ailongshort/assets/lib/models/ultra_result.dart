import 'plan.dart';
import 'decision.dart';

/// 0..100 점수(막대바) 5종
class EvidenceScore {
  final int flow;
  final int shape;
  final int bigHand;
  final int crowding;
  final int risk;

  const EvidenceScore({
    required this.flow,
    required this.shape,
    required this.bigHand,
    required this.crowding,
    required this.risk,
  });

  int get avg => ((flow + shape + bigHand + crowding + risk) / 5).round();
}

/// UltraEngine 결과 (UI에서 그대로 사용)
class UltraResult {
    final int evidenceHit;
  final int evidenceTotal;

/// decision.dart에 정의된 UiDecision 사용
  final UiDecision decision;

  final EvidenceScore evidence;
  final Plan? plan;
  final int coreScore; // 0..100
  final List<double> pulse; // 0..1 정규화 파형

  const UltraResult({
    this.evidenceHit = 0,
    this.evidenceTotal = 0,
    required this.decision,
    required this.evidence,
    required this.plan,
    required this.coreScore,
    required this.pulse,
  });

  factory UltraResult.empty() => UltraResult(
        decision: const UiDecision(
          title: '관망',
          detail: '초기화 상태',
          locked: true,
          confidence: 0,
        ),
        evidence: const EvidenceScore(
          flow: 0,
          shape: 0,
          bigHand: 0,
          crowding: 0,
          risk: 0,
        ),
        plan: null,
        coreScore: 0,
        pulse: const <double>[],
      );
}