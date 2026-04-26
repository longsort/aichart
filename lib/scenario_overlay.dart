
import 'package:flutter/material.dart';
import 'future_core.dart';

class ScenarioOverlay extends StatelessWidget {
  final List<Scenario> scenarios;
  const ScenarioOverlay({super.key, required this.scenarios});

  @override
  Widget build(BuildContext context) {
    if (scenarios.isEmpty) return const SizedBox.shrink();

    Widget row(Scenario s) {
      final pct = (s.p * 100).round();
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 2),
        child: Row(
          children: [
            SizedBox(width: 22, child: Text(s.id, style: const TextStyle(color: Colors.white70, fontSize: 11))),
            Expanded(child: Text(s.name, style: const TextStyle(color: Colors.white70, fontSize: 11))),
            Text("$pct%", style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w700)),
          ],
        ),
      );
    }

    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: const Color(0xFF0B0B0F).withOpacity(0.75),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: Colors.white24, width: 1),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text("?�来/미래", style: TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.w800)),
          const SizedBox(height: 6),
          ...scenarios.map(row),
        ],
      ),
    );
  }
}
