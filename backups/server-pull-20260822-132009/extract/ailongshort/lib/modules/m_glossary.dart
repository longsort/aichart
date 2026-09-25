import 'package:flutter/material.dart';
import '../common.dart';

class ModGlossary extends StatelessWidget {
  const ModGlossary({super.key});

  @override
  Widget build(BuildContext context) {
    final tfs = const [
      "5�?· 매우짧음",
      "15�?· 짧음",
      "1?�간 · 보통",
      "4?�간 · 중간",
      "1??· 김",
      "1�?· 매우김",
      "1??· 추세",
    ];

    return Scaffold(
      backgroundColor: bg,
      appBar: AppBar(backgroundColor: bg, title: const Text("초보???�어/?�간"), foregroundColor: Colors.white),
      body: Center(
        child: Container(
          width: 360,
          padding: const EdgeInsets.all(18),
          decoration: cardDeco(),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text("초보???�명", style: tTitle()),
              const SizedBox(height: 12),
              const Text("??진입: ?�어가???�는 구간",
                  style: TextStyle(color: Colors.tealAccent, fontWeight: FontWeight.w800)),
              const Text("??관�? ?�직 기다?�야 ??,
                  style: TextStyle(color: Colors.amberAccent, fontWeight: FontWeight.w800)),
              const Text("???��? ?�험, ?�는 구간",
                  style: TextStyle(color: Colors.redAccent, fontWeight: FontWeight.w800)),
              const SizedBox(height: 14),
              Text("?�간 기�? (초보??", style: tTitle()),
              const SizedBox(height: 10),
              for (final t in tfs)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 4),
                  child: Text("??$t", style: TextStyle(color: Colors.white.withOpacity(0.75), fontWeight: FontWeight.w800)),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
