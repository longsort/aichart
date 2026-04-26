import 'dart:math';
import 'package:flutter/material.dart';
import '../common.dart';
import '../engine_evidence.dart';

class ModEvidencePulse extends StatefulWidget {
  const ModEvidencePulse({super.key});
  @override
  State<ModEvidencePulse> createState() => _ModEvidencePulseState();
}

class _ModEvidencePulseState extends State<ModEvidencePulse> with TickerProviderStateMixin {
  final rnd = Random();
  final engine = EvidenceEngine();
  final List<double> ev = List.filled(6, 0.2);

  int prevCount = 0;
  EngineResult? now;

  late AnimationController pulse;
  double kick = 0;

  @override
  void initState() {
    super.initState();
    pulse = AnimationController(vsync: this, duration: const Duration(milliseconds: 520))
      ..addListener(() => setState(() => kick = Curves.easeOut.transform(pulse.value)));
    _run();
  }

  @override
  void dispose() {
    pulse.dispose();
    super.dispose();
  }

  void _pulse() {
    pulse.stop();
    pulse.reset();
    pulse.forward();
  }

  void _collectEvidence() {
    final i = rnd.nextInt(6);
    ev[i] = (ev[i] + 0.18 + rnd.nextDouble() * 0.12).clamp(0.0, 1.0);
  }

  void _run() {
    _collectEvidence();
    final r = engine.run(ev);
    if (r.evidence > prevCount) _pulse();
    prevCount = r.evidence;
    setState(() => now = r);
  }

  @override
  Widget build(BuildContext context) {
    final r = now;
    final conf = r?.confidence ?? 0.0;
    final c = r == null ? Colors.white70 : heat(conf);
    final scale = 1.0 + 0.020 * kick;
    final glow = (0.18 + 0.18 * kick).clamp(0.0, 0.55);

    return Scaffold(
      backgroundColor: bg,
      appBar: AppBar(backgroundColor: bg, title: const Text("Evidence Pulse"), foregroundColor: Colors.white),
      body: Center(
        child: GestureDetector(
          onTap: _run,
          child: Transform.scale(
            scale: scale,
            child: Container(
              width: 300,
              height: 300,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                boxShadow: [BoxShadow(color: c.withOpacity(glow), blurRadius: 120, spreadRadius: 28)],
                border: Border.all(color: Colors.white.withOpacity(0.10), width: 2),
              ),
              child: Center(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text("${(conf * 100).round()}%",
                        style: const TextStyle(color: Colors.white, fontSize: 48, fontWeight: FontWeight.w900)),
                    const SizedBox(height: 10),
                    Text(r == null ? "" : r.labelKo(),
                        style: TextStyle(color: c, fontSize: 22, fontWeight: FontWeight.w900)),
                    const SizedBox(height: 8),
                    Text("증거 ${r?.evidence ?? 0}/6",
                        style: TextStyle(color: Colors.white.withOpacity(0.55), fontWeight: FontWeight.w800)),
                    if (r != null && r.lock > 0) ...[
                      const SizedBox(height: 6),
                      Text("LOCK ${r.lock}",
                          style: TextStyle(color: Colors.white.withOpacity(0.55), fontWeight: FontWeight.w900)),
                    ]
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
