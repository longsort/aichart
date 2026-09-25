import 'dart:math';
import 'package:flutter/material.dart';
import '../common.dart';
import '../whale_engine.dart';

class ModWhale extends StatefulWidget {
  const ModWhale({super.key});
  @override
  State<ModWhale> createState() => _ModWhaleState();
}

class _ModWhaleState extends State<ModWhale> {
  final rnd = Random();
  final engine = WhaleEngine();
  WhaleState? state;

  void run() {
    final cvd = (rnd.nextDouble() * 2 - 1).clamp(-1.0, 1.0);
    final vol = rnd.nextDouble();
    setState(() => state = engine.analyze(cvd, vol));
  }

  Color cvdColor(double v) {
    if (v > 0.35) return Colors.tealAccent;
    if (v < -0.35) return Colors.redAccent;
    return Colors.amberAccent;
  }

  @override
  Widget build(BuildContext context) {
    final s = state;
    return Scaffold(
      backgroundColor: bg,
      appBar: AppBar(backgroundColor: bg, title: const Text("Whale / 세력 분석"), foregroundColor: Colors.white),
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
                Text("Whale / 세력 분석", style: tTitle()),
                const SizedBox(height: 14),
                if (s == null)
                  Text("탭 → 고래 데이터 분석", style: tSub())
                else ...[
                  Text("CVD ${(s.cvd * 100).round()}%", style: TextStyle(color: cvdColor(s.cvd), fontWeight: FontWeight.w900)),
                  const SizedBox(height: 6),
                  Text("거래량 ${(s.volume * 100).round()}%", style: tSub()),
                  const SizedBox(height: 12),
                  Text(
                    s.accumulation ? "고래 매집 진행" : s.distribution ? "고래 분산 진행" : "중립",
                    style: TextStyle(
                      color: s.accumulation ? Colors.tealAccent : s.distribution ? Colors.redAccent : Colors.white70,
                      fontWeight: FontWeight.w900,
                      fontSize: 16,
                    ),
                  ),
                ],
                const SizedBox(height: 12),
                Text("※ 자동매매 없음 · 판단 참고용", style: tDim()),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
