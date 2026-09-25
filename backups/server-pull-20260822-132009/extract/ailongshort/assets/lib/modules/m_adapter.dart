import 'package:flutter/material.dart';
import '../common.dart';
import '../data_adapter.dart';

class ModAdapter extends StatefulWidget {
  const ModAdapter({super.key});
  @override
  State<ModAdapter> createState() => _ModAdapterState();
}

class _ModAdapterState extends State<ModAdapter> {
  final WhaleDataSource source = MockWhaleSource();
  WhaleSnapshot? snap;

  Future<void> load() async {
    final s = await source.fetch();
    setState(() => snap = s);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: bg,
      appBar: AppBar(backgroundColor: bg, title: const Text("실데이터 어댑터"), foregroundColor: Colors.white),
      body: Center(
        child: GestureDetector(
          onTap: load,
          child: Container(
            width: 360,
            padding: const EdgeInsets.all(18),
            decoration: cardDeco(),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text("실데이터 어댑터", style: tTitle()),
                const SizedBox(height: 12),
                if (snap == null)
                  Text("탭 → 데이터 불러오기", style: tSub())
                else ...[
                  Text("CVD ${(snap!.cvd * 100).round()}%", style: TextStyle(color: heat((snap!.cvd + 1) / 2), fontWeight: FontWeight.w900)),
                  const SizedBox(height: 6),
                  Text("거래량 ${(snap!.volume * 100).round()}%", style: tSub()),
                  const SizedBox(height: 6),
                  Text("TIME ${snap!.time.toIso8601String().substring(11, 19)}", style: tDim()),
                ],
                const SizedBox(height: 12),
                Text("※ 구조 고정 · 실제 API는 어댑터만 교체", style: tDim()),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
