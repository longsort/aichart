import 'package:flutter/material.dart';

class EvidenceHeatmapCard extends StatelessWidget {
  final Map<String, double> weights;

  const EvidenceHeatmapCard({super.key, required this.weights});

  @override
  Widget build(BuildContext context) {
    final keys = weights.keys.toList()..sort();
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
          const Text('근거 히트맵', style: TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.bold)),
          const SizedBox(height: 10),
          if (keys.isEmpty)
            const Text('No weights yet. Record snapshots → Stats refresh.',
                style: TextStyle(color: Colors.white54, fontSize: 12)),
          if (keys.isNotEmpty)
            ...keys.map((k) => _row(k, weights[k] ?? 1.0)),
        ],
      ),
    );
  }

  Widget _row(String k, double w) {
    // visualize weight: 0.5~1.5 => 0~1
    final v = ((w - 0.5) / 1.0).clamp(0.0, 1.0);
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        children: [
          SizedBox(width: 110, child: Text(k, style: const TextStyle(color: Colors.white70, fontSize: 12))),
          Expanded(
            child: ClipRRect(
              borderRadius: BorderRadius.circular(999),
              child: LinearProgressIndicator(
                value: v,
                backgroundColor: Colors.white.withOpacity(0.08),
                valueColor: const AlwaysStoppedAnimation<Color>(Colors.cyanAccent),
                minHeight: 10,
              ),
            ),
          ),
          const SizedBox(width: 8),
          Text(w.toStringAsFixed(2), style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.bold)),
        ],
      ),
    );
  }
}