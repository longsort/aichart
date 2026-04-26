
import 'package:flutter/material.dart';
import '../../core/stats/signal_stats.dart';

class SignalStatsCard extends StatelessWidget {
  final SignalStats stats;
  const SignalStatsCard(this.stats);

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(stats.key, style: const TextStyle(fontWeight: FontWeight.bold)),
            const SizedBox(height: 8),
            Text('Win: ${stats.win}  Lose: ${stats.lose}'),
            Text('WinRate: ${(stats.winRate * 100).toStringAsFixed(1)}%'),
          ],
        ),
      ),
    );
  }
}
