import 'package:flutter/material.dart';

class SignalHistoryCard extends StatelessWidget {
  final List<Map<String, dynamic>> rows;
  const SignalHistoryCard({super.key, required this.rows});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.black.withOpacity(0.30),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.white24),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('ÏµúÍ∑º Í∏∞Î°ù(?êÎèô ?Ä??',
              style: TextStyle(color: Colors.white, fontWeight: FontWeight.w900)),
          const SizedBox(height: 10),
          if (rows.isEmpty)
            const Text('?ÑÏßÅ Í∏∞Î°ù???ÜÏñ¥??', style: TextStyle(color: Colors.white70))
          else
            ...rows.take(6).map((r) {
              final dir = (r['dir'] ?? '').toString();
              final price = (r['price'] ?? '').toString();
              final tf = (r['tf'] ?? '').toString();
              final conf = (r['conf'] ?? '').toString();
              return Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        '[$tf] $dir',
                        style: const TextStyle(color: Colors.white70),
                      ),
                    ),
                    Text(price, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800)),
                    const SizedBox(width: 10),
                    Text('$conf%', style: const TextStyle(color: Colors.white60)),
                  ],
                ),
              );
            }).toList(),
          const SizedBox(height: 6),
          const Text('???Ä???ÑÏπò: ?ÑÎ°ú?ùÌä∏ ?¥Îçî??fulink_logs.jsonl',
              style: TextStyle(color: Colors.white54, fontSize: 12)),
        ],
      ),
    );
  }
}
