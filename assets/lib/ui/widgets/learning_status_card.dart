import 'package:flutter/material.dart';
import '../../engine/learning/learning_engine.dart';

class LearningStatusCard extends StatefulWidget {
  const LearningStatusCard({super.key});

  @override
  State<LearningStatusCard> createState() => _LearningStatusCardState();
}

class _LearningStatusCardState extends State<LearningStatusCard> {
  // ✅ 중복 렌더 방지용 (화면당 1개)
  static final Set<String> _locks = <String>{};

  late String _lockKey;
  bool _hidden = false;
  bool _ownsLock = false;

  int _winRate = 0;
  int _penalty = 0;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    // ❗ context 사용 금지 → 여기서는 아무 것도 안 함
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();

    // ✅ context 안전 구간
    _lockKey =
        'LearningStatusCard@${ModalRoute.of(context)?.settings.name ?? 'root'}';

    if (_locks.contains(_lockKey)) {
      _hidden = true;
      _ownsLock = false;
      return;
    }

    _locks.add(_lockKey);
    _ownsLock = true;
    _load();
  }

  @override
  void dispose() {
    if (_ownsLock) {
      _locks.remove(_lockKey);
    }
    super.dispose();
  }

  Future<void> _load() async {
    final stats = await LearningEngine.recentStats(maxLines: 200);
    final pen = await LearningEngine.conservatismPenalty(window: 160);
    if (!mounted) return;
    setState(() {
      _winRate = stats.winRatePct;
      _penalty = pen;
      _loading = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    if (_hidden) return const SizedBox.shrink();

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.black12,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: Colors.amberAccent),
      ),
      child: _loading
          ? const Text("자가보정 로딩중…")
          : Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  "자가학습(자가보정) 상태",
                  style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                ),
                const SizedBox(height: 6),
                Text("최근 승률(대략): $_winRate%"),
                Text("보수성 보정치: -$_penalty (클수록 쉬기↑)"),
                const SizedBox(height: 6),
                const Text("※ 이 기능은 ‘안전형’으로만 보정합니다."),
              ],
            ),
    );
  }
}