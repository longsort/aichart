
import 'package:flutter/material.dart';
import 'evidence_pulse.dart';
import 'confidence_meter.dart';
import 'reason_line.dart';

class AIDecisionBundle extends StatelessWidget {
  final Widget gauge;
  final int evidenceCount;
  final double confidence;
  final List<String> reasons;

  const AIDecisionBundle({
    super.key,
    required this.gauge,
    required this.evidenceCount,
    required this.confidence,
    required this.reasons,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        EvidencePulse(evidenceCount: evidenceCount, child: gauge),
        const SizedBox(height: 22),
        ConfidenceMeter(confidence: confidence),
        const SizedBox(height: 12),
        ReasonLine(reasons: reasons),
      ],
    );
  }
}
