
import 'package:flutter/material.dart';
import 'evidence_pulse.dart';
import 'confidence_meter.dart';
import 'reason_line.dart';

class AIBundleV1 extends StatelessWidget {
  final int evidenceCount;
  final double confidence;
  final List<String> reasons;
  final Widget gauge;

  const AIBundleV1({
    super.key,
    required this.evidenceCount,
    required this.confidence,
    required this.reasons,
    required this.gauge,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        EvidencePulse(
          evidenceCount: evidenceCount,
          child: gauge,
        ),
        const SizedBox(height: 24),
        ConfidenceMeter(confidence: confidence),
        const SizedBox(height: 12),
        ReasonLine(reasons: reasons),
      ],
    );
  }
}
