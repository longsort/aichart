import 'package:flutter/material.dart';
import '../../engine/learning/learning_engine.dart';

class LearningStatusCard extends StatefulWidget {
  const LearningStatusCard({super.key});

  @override
  State<LearningStatusCard> createState() => _LearningStatusCardState();
}

class _LearningStatusCardState extends State<LearningStatusCard> {
  // ??ì¤‘ë³µ ?Œë” ë°©ì???(?”ë©´??1ê°?
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
    // ??context ?¬ìš© ê¸ˆì? ???¬ê¸°?œëŠ” ?„ë¬´ ê²ƒë„ ????  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();

    // ??context ?ˆì „ êµ¬ê°„
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
          ? const Text("?ê?ë³´ì • ë¡œë”©ì¤‘â€?)
          : Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  "?ê??™ìŠµ(?ê?ë³´ì •) ?íƒœ",
                  style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                ),
                const SizedBox(height: 6),
                Text("ìµœê·¼ ?¹ë¥ (?€??: $_winRate%"),
                Text("ë³´ìˆ˜??ë³´ì •ì¹? -$_penalty (?´ìˆ˜ë¡??¬ê¸°??"),
                const SizedBox(height: 6),
                const Text("????ê¸°ëŠ¥?€ ?˜ì•ˆ?„í˜•?™ìœ¼ë¡œë§Œ ë³´ì •?©ë‹ˆ??"),
              ],
            ),
    );
  }
}