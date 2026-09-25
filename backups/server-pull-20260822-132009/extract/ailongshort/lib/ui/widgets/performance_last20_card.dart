import 'package:flutter/material.dart';

class PerformanceLast20Card extends StatelessWidget {
  final int win;
  final int loss;
  final int timeout;
  final int open;
  final double winRate;
  final double avgRR;
  final double avgEvidence;

  const PerformanceLast20Card({
    super.key,
    required this.win,
    required this.loss,
    required this.timeout,
    required this.open,
    required this.winRate,
    required this.avgRR,
    required this.avgEvidence,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.06),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.white.withOpacity(0.10)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('ÏµúÍ∑º 20Í∞??±Í≥º', style: TextStyle(color: Colors.white, fontSize: 14, fontWeight: FontWeight.bold)),
          const SizedBox(height: 8),
          _row('??, '$win'),
          _row('??, '$loss'),
          _row('?Ä?ÑÏïÑ??, '$timeout'),
          _row('ÏßÑÌñâÏ§?, '$open'),
          const Divider(height: 18),
          _row('?πÎ•†', '${winRate.toStringAsFixed(1)}%'),
          _row('?âÍ∑† RR', avgRR.isNaN ? '--' : avgRR.toStringAsFixed(2)),
          _row('?âÍ∑† Í∑ºÍ±∞?êÏàò', avgEvidence.isNaN ? '--' : avgEvidence.toStringAsFixed(2)),
        ],
      ),
    );
  }

  Widget _row(String k, String v) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Row(
        children: [
          SizedBox(width: 88, child: Text(k, style: const TextStyle(color: Colors.white70, fontSize: 12))),
          Text(v, style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.bold)),
        ],
      ),
    );
  }
}