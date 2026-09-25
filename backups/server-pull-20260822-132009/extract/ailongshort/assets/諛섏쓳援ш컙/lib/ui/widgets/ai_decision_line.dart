import 'package:flutter/material.dart';

/// STEP 1: AI 판단 1줄 요약 카드
class AiDecisionLine extends StatelessWidget {
  final String decision;
  final String reason;

  const AiDecisionLine({
    super.key,
    required this.decision,
    required this.reason,
  });

  Color _color() {
    if (decision.contains('매수')) return const Color(0xFF1EEA6A);
    if (decision.contains('매도')) return const Color(0xFFEA2A2A);
    return const Color(0xFF4DA3FF);
  }

  @override
  Widget build(BuildContext context) {
    final c = _color();
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: c.withOpacity(0.6)),
        color: c.withOpacity(0.12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('AI 판단: $decision',
              style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w900)),
          const SizedBox(height: 6),
          Text(reason, style: const TextStyle(fontSize: 11)),
        ],
      ),
    );
  }
}
