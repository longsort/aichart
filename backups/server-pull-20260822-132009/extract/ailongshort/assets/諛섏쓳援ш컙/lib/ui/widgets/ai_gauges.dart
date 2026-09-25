import 'package:flutter/material.dart';

/// STEP 2: 확신도/방향 게이지 (롱/숏/중립)
class AiGauges extends StatelessWidget {
  final int confidence; // 0~100
  final int longP; // 0~100
  final int shortP; // 0~100
  final int neutralP; // 0~100

  const AiGauges({
    super.key,
    required this.confidence,
    required this.longP,
    required this.shortP,
    required this.neutralP,
  });

  @override
  Widget build(BuildContext context) {
    final c = confidence.clamp(0, 100);
    int clamp100(int v) => v.clamp(0, 100);
    final lp = clamp100(longP);
    final sp = clamp100(shortP);
    final np = clamp100(neutralP);

    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: const Color(0x22FFFFFF)),
        color: const Color(0x11000000),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Text('확신도',
                  style: TextStyle(fontSize: 11, fontWeight: FontWeight.w900)),
              const Spacer(),
              Text('$c%',
                  style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w900)),
            ],
          ),
          const SizedBox(height: 6),
          ClipRRect(
            borderRadius: BorderRadius.circular(8),
            child: LinearProgressIndicator(
              value: c / 100.0,
              minHeight: 10,
              backgroundColor: const Color(0x22FFFFFF),
              valueColor: const AlwaysStoppedAnimation<Color>(Color(0xFF4DA3FF)),
            ),
          ),
          const SizedBox(height: 10),
          const Text('방향 비율',
              style: TextStyle(fontSize: 11, fontWeight: FontWeight.w900)),
          const SizedBox(height: 6),
          _barRow('롱', lp, const Color(0xFF1EEA6A)),
          const SizedBox(height: 6),
          _barRow('숏', sp, const Color(0xFFEA2A2A)),
          const SizedBox(height: 6),
          _barRow('중립', np, const Color(0xFFB0B6C4)),
        ],
      ),
    );
  }

  Widget _barRow(String name, int v, Color color) {
    return Row(
      children: [
        SizedBox(
          width: 34,
          child: Text(name,
              style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w800)),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: ClipRRect(
            borderRadius: BorderRadius.circular(8),
            child: LinearProgressIndicator(
              value: v / 100.0,
              minHeight: 8,
              backgroundColor: const Color(0x22FFFFFF),
              valueColor: AlwaysStoppedAnimation<Color>(color),
            ),
          ),
        ),
        const SizedBox(width: 8),
        SizedBox(
          width: 40,
          child: Text('$v%',
              textAlign: TextAlign.right,
              style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w800)),
        ),
      ],
    );
  }
}
