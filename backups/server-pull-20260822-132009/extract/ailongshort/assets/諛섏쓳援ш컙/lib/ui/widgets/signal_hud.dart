import 'package:flutter/material.dart';

class SignalHUD extends StatelessWidget {
  final String finalState; // LONG/SHORT/WAIT/BLOCK
  final int probability;
  final int structureScore;
  final int reactionScore;
  final int executionScore;
  final String oneLine;

  const SignalHUD({
    super.key,
    required this.finalState,
    required this.probability,
    required this.structureScore,
    required this.reactionScore,
    required this.executionScore,
    required this.oneLine,
  });

  Color _c(String s) {
    switch (s) {
      case 'LONG': return const Color(0xFF2EE6A6);
      case 'SHORT': return const Color(0xFFFF4D6D);
      case 'BLOCK': return Colors.grey;
      default: return Colors.blueGrey;
    }
  }

  String _badge() {
    if (finalState == 'BLOCK') return 'NO-TRADE';
    if (finalState == 'WAIT') return '관망';
    if (probability >= 70 && executionScore >= 65) return 'SIGNAL';
    if (probability >= 55) return 'CAUTION';
    return 'WATCH';
  }

  Widget _bar(String name, int v) {
    return Row(
      children: [
        SizedBox(width: 52, child: Text(name, style: const TextStyle(fontSize: 12, color: Colors.white70))),
        Expanded(
          child: ClipRRect(
            borderRadius: BorderRadius.circular(999),
            child: LinearProgressIndicator(
              value: (v.clamp(0, 100)) / 100,
              minHeight: 8,
              backgroundColor: const Color(0xFF1C2230),
              valueColor: AlwaysStoppedAnimation<Color>(Colors.white.withOpacity(0.85)),
            ),
          ),
        ),
        const SizedBox(width: 8),
        SizedBox(width: 40, child: Text('$v%', textAlign: TextAlign.right, style: const TextStyle(fontSize: 12, color: Colors.white70))),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    final color = _c(finalState);
    final badge = _badge();

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: color.withOpacity(0.45), width: 1.2),
        color: const Color(0xFF0E121A).withOpacity(0.65),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                decoration: BoxDecoration(
                  color: color.withOpacity(0.15),
                  borderRadius: BorderRadius.circular(999),
                  border: Border.all(color: color.withOpacity(0.65)),
                ),
                child: Text(badge, style: TextStyle(color: color, fontSize: 12, fontWeight: FontWeight.w700)),
              ),
              const SizedBox(width: 10),
              Text('$finalState  $probability%',
                  style: TextStyle(color: color, fontSize: 14, fontWeight: FontWeight.w800)),
            ],
          ),
          const SizedBox(height: 10),
          _bar('구조', structureScore),
          const SizedBox(height: 6),
          _bar('반응', reactionScore),
          const SizedBox(height: 6),
          _bar('체결', executionScore),
          const SizedBox(height: 10),
          Text(oneLine, style: const TextStyle(fontSize: 12, color: Colors.white70)),
        ],
      ),
    );
  }
}
