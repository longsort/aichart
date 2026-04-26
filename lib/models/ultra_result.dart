import 'plan.dart';
import 'decision.dart';

/// 0..100 ?êÏàò(ÎßâÎ?Î∞? 5Ï¢?class EvidenceScore {
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

/// UltraEngine Í≤∞Í≥º (UI?êÏÑú Í∑∏Î?Î°??¨Ïö©)
class UltraResult {
    final int evidenceHit;
  final int evidenceTotal;

/// decision.dart???ïÏùò??UiDecision ?¨Ïö©
  final UiDecision decision;

  final EvidenceScore evidence;
  final Plan? plan;
  final int coreScore; // 0..100
  final List<double> pulse; // 0..1 ?ïÍ∑ú???åÌòï

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
          title: 'Í¥ÄÎß?,
          detail: 'Ï¥àÍ∏∞???ÅÌÉú',
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