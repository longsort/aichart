
import 'package:flutter/material.dart';
import 'state_engine.dart';
import 'future_core.dart';

class DecisionPopup extends StatelessWidget {
  final MarketState state;
  final List<Scenario> scenarios;

  const DecisionPopup({super.key, required this.state, required this.scenarios});

  @override
  Widget build(BuildContext context) {
    String stateText = switch (state) {
      MarketState.stable => "稳定 / 진입 가능",
      MarketState.energy => "能量 / 타이밍",
      MarketState.uncertain => "不确定 / 대기",
      MarketState.danger => "危险 / 관망",
    };

    return Dialog(
      backgroundColor: const Color(0xFF0B0B0F),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text("决策 / 판단", style: const TextStyle(color: Colors.white, fontSize: 14, fontWeight: FontWeight.w800)),
            const SizedBox(height: 8),
            Text(stateText, style: const TextStyle(color: Colors.white70, fontSize: 12)),
            const SizedBox(height: 10),
            const Text("未来/미래", style: TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.w700)),
            const SizedBox(height: 6),
            ...scenarios.map((s) => Text(
              "${s.id}. ${s.name} ${(s.p*100).round()}%",
              style: const TextStyle(color: Colors.white70, fontSize: 11),
            )),
            const SizedBox(height: 14),
            Align(
              alignment: Alignment.centerRight,
              child: TextButton(
                onPressed: () => Navigator.pop(context),
                child: const Text("확인 / 确认"),
              ),
            )
          ],
        ),
      ),
    );
  }
}
