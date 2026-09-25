import 'package:flutter/material.dart';

class AiPastStatsCard extends StatelessWidget {
  final int n;
  final int winP;
  final double avgMoveP;
  final double avgRR;
  final String hint;

  const AiPastStatsCard({
    super.key,
    required this.n,
    required this.winP,
    required this.avgMoveP,
    required this.avgRR,
    required this.hint,
  });

  @override
  Widget build(BuildContext context) {
    final ok = winP >= 55 && n >= 5;
    final c = ok ? const Color(0xFF1EEA6A) : const Color(0xFF4DA3FF);

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
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(999),
                  color: c.withOpacity(0.15),
                  border: Border.all(color: c.withOpacity(0.4)),
                ),
                child: Text('Í≥ºÍ±∞ ?µÍ≥Ñ',
                    style: TextStyle(fontSize: 11, fontWeight: FontWeight.w900, color: c)),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(hint,
                    style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w900),
                    overflow: TextOverflow.ellipsis),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text('?úÎ≥∏: $n', style: const TextStyle(fontSize: 10)),
          Text('?πÎ•†: $winP%', style: const TextStyle(fontSize: 10)),
          Text('?âÍ∑† ?¥Îèô: ${avgMoveP.toStringAsFixed(2)}%',
              style: const TextStyle(fontSize: 10)),
          Text('?âÍ∑† RR: ${avgRR.toStringAsFixed(2)}',
              style: const TextStyle(fontSize: 10)),
        ],
      ),
    );
  }
}
