import 'package:flutter/material.dart';

/// STEP8: 지지/돌파/헌트 배지 + 게이지
class AiRiskBadges extends StatelessWidget {
  final int supportP;
  final int breakoutP;
  final int stopHuntP;
  final String badge;

  const AiRiskBadges({
    super.key,
    required this.supportP,
    required this.breakoutP,
    required this.stopHuntP,
    required this.badge,
  });

  Color _c(String t) {
    if (t.contains('돌파')) return const Color(0xFF4DA3FF);
    if (t.contains('지지')) return const Color(0xFF1EEA6A);
    if (t.contains('헌트') || t.contains('주의')) return const Color(0xFFEA2A2A);
    return const Color(0xFF9AA4B2);
  }

  Widget _pill(String text) {
    final c = _c(text);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(999),
        color: c.withOpacity(0.14),
        border: Border.all(color: c.withOpacity(0.45)),
      ),
      child: Text(text,
          style: TextStyle(fontSize: 10, fontWeight: FontWeight.w900, color: c)),
    );
  }

  Widget _bar(String name, int v) {
    return Row(
      children: [
        SizedBox(
          width: 64,
          child: Text(name, style: const TextStyle(fontSize: 10)),
        ),
        Expanded(
          child: ClipRRect(
            borderRadius: BorderRadius.circular(999),
            child: LinearProgressIndicator(
              value: (v.clamp(0, 100)) / 100.0,
              minHeight: 8,
              backgroundColor: const Color(0x22FFFFFF),
            ),
          ),
        ),
        const SizedBox(width: 8),
        SizedBox(
          width: 34,
          child: Text('$v%',
              textAlign: TextAlign.right,
              style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w900)),
        ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
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
          const Text('오더플로우 요약',
              style: TextStyle(fontSize: 11, fontWeight: FontWeight.w900)),
          const SizedBox(height: 6),
          _pill(badge),
          const SizedBox(height: 8),
          _bar('지지', supportP),
          const SizedBox(height: 6),
          _bar('돌파', breakoutP),
          const SizedBox(height: 6),
          _bar('헌트', stopHuntP),
        ],
      ),
    );
  }
}
