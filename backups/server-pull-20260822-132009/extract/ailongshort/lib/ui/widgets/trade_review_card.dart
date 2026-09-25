import 'package:flutter/material.dart';

class TradeReviewCard extends StatelessWidget {
  final Map<String, dynamic> log;
  const TradeReviewCard({super.key, required this.log});

  @override
  Widget build(BuildContext context) {
    final review = (log['review'] ?? '').toString().trim();
    final symbol = (log['symbol'] ?? '').toString();
    final tf = (log['tf'] ?? '').toString();
    final result = (log['result'] ?? '').toString();
    final entry = log['entry'];
    final stop = log['stop'];
    final target = log['target'];

    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: Colors.white24),
        color: Colors.black.withOpacity(0.25),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            review.isEmpty ? '복기 ?�음' : review,
            style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 6),
          Text(
            '$symbol · $tf · $result',
            style: const TextStyle(fontSize: 11, color: Colors.white70),
          ),
          const SizedBox(height: 6),
          Text(
            'E:$entry  SL:$stop  TP:$target',
            style: const TextStyle(fontSize: 11, color: Colors.white70),
          ),
        ],
      ),
    );
  }
}
