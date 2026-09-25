import 'dart:math';
import 'package:flutter/material.dart';
import '../common.dart';
import '../ai_think.dart';

class ModAiReasons extends StatefulWidget {
  const ModAiReasons({super.key});
  @override
  State<ModAiReasons> createState() => _ModAiReasonsState();
}

class _ModAiReasonsState extends State<ModAiReasons> {
  final rnd = Random();
  int evidence = 3;
  bool acc = false;
  bool dis = false;

  void run() {
    evidence = rnd.nextInt(7);
    acc = rnd.nextBool();
    dis = !acc && rnd.nextBool();
    setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    final reasons = buildReasons(evidence: evidence, whaleAcc: acc, whaleDis: dis);
    return Scaffold(
      backgroundColor: bg,
      appBar: AppBar(backgroundColor: bg, title: const Text("AI ?�단 근거"), foregroundColor: Colors.white),
      body: Center(
        child: GestureDetector(
          onTap: run,
          child: Container(
            width: 360,
            padding: const EdgeInsets.all(18),
            decoration: cardDeco(),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text("AI ?�단 근거", style: tTitle()),
                const SizedBox(height: 14),
                for (final r in reasons)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 6),
                    child: Row(
                      children: [
                        Container(width: 6, height: 6, decoration: const BoxDecoration(shape: BoxShape.circle, color: Colors.tealAccent)),
                        const SizedBox(width: 8),
                        Text("${r.title}: ${r.desc}", style: tSub()),
                      ],
                    ),
                  ),
                const SizedBox(height: 12),
                Text("???�동매매 ?�음 · ?�단 ?�명 ?�용", style: tDim()),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
