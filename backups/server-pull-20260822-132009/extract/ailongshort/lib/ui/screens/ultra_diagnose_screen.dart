import 'package:flutter/material.dart';
import '../../engine/core/core_engine.dart';
import '../../engine/ai/ai_decision.dart';
import '../../engine/ai/ai_wave.dart';
import '../../engine/ai/ai_guard.dart';

class UltraDiagnoseScreen extends StatelessWidget {
  const UltraDiagnoseScreen({super.key});

  @override
  Widget build(BuildContext context) {
    // Demo snapshot (wire real data later)
    final core = CoreEngine();
    final snap = core.analyze(tf: '15m', prices: const [100, 102, 101, 103], volumes: const [1000, 1200, 900]);
    final dec = AiDecision().decide(snap);
    final wave = AiWave().wave(snap);
    final guard = AiGuard().guard(snap);

    return Scaffold(
      appBar: AppBar(title: const Text('Diagnose')),
      body: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('TF: ${snap.tf}'),
            Text('UP: ${snap.breakoutUpPct.toStringAsFixed(1)} / DOWN: ${snap.breakoutDownPct.toStringAsFixed(1)}'),
            Text('WHALE: ${snap.whaleGrade}'),
            Text('RISK: ${(snap.risk01 * 100).toStringAsFixed(0)}'),
            const SizedBox(height: 12),
            Text('AI: ${dec.decision} (L${dec.longPct}/S${dec.shortPct}/N${dec.noTradePct})'),
            Text('WAVE: ${wave.phase} (${wave.strength})'),
            Text('GUARD: ${guard.lock ? 'LOCK' : 'OK'} · ${guard.reason}'),
          ],
        ),
      ),
    );
  }
}
