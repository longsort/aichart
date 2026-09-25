import 'package:flutter/material.dart';
import '../../engine/central_evidence_hub.dart';

class EvidenceHudRing extends StatelessWidget {
  const EvidenceHudRing({super.key});

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder(
      valueListenable: CentralEvidenceHub.notifier,
      builder: (_, map, __) {
        final percent = (CentralEvidenceHub.count / 10.0).clamp(0.0, 1.0);
        return Column(
          children: [
            Text("증거 ${CentralEvidenceHub.count}/10"),
            LinearProgressIndicator(value: percent),
          ],
        );
      },
    );
  }
}
