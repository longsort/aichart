import 'package:flutter/material.dart';
import '../common.dart';

class ModGlossary extends StatelessWidget {
  const ModGlossary({super.key});

  @override
  Widget build(BuildContext context) {
    final tfs = const [
      "5분 · 매우짧음",
      "15분 · 짧음",
      "1시간 · 보통",
      "4시간 · 중간",
      "1일 · 김",
      "1주 · 매우김",
      "1달 · 추세",
    ];

    return Scaffold(
      backgroundColor: bg,
      appBar: AppBar(backgroundColor: bg, title: const Text("초보용 단어/시간"), foregroundColor: Colors.white),
      body: Center(
        child: Container(
          width: 360,
          padding: const EdgeInsets.all(18),
          decoration: cardDeco(),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text("초보용 설명", style: tTitle()),
              const SizedBox(height: 12),
              const Text("• 진입: 들어가도 되는 구간",
                  style: TextStyle(color: Colors.tealAccent, fontWeight: FontWeight.w800)),
              const Text("• 관망: 아직 기다려야 함",
                  style: TextStyle(color: Colors.amberAccent, fontWeight: FontWeight.w800)),
              const Text("• 대기: 위험, 쉬는 구간",
                  style: TextStyle(color: Colors.redAccent, fontWeight: FontWeight.w800)),
              const SizedBox(height: 14),
              Text("시간 기준 (초보용)", style: tTitle()),
              const SizedBox(height: 10),
              for (final t in tfs)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 4),
                  child: Text("• $t", style: TextStyle(color: Colors.white.withOpacity(0.75), fontWeight: FontWeight.w800)),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
