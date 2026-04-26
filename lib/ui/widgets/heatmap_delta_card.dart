import 'package:flutter/material.dart';

class HeatmapDeltaCard extends StatelessWidget {
  final Map<String, double> weights;
  final Map<String, double>? baseline;

  const HeatmapDeltaCard({
    super.key,
    required this.weights,
    this.baseline,
  });

  @override
  Widget build(BuildContext context) {
    final base = baseline ?? const <String, double>{};

    final entries = weights.entries.toList()
      ..sort((a, b) {
        final da = (a.value - (base[a.key] ?? 1.0)).abs();
        final db = (b.value - (base[b.key] ?? 1.0)).abs();
        return db.compareTo(da);
      });

    final top = entries.take(8).toList(growable: false);

    final hasBase = base.isNotEmpty;

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
          Text(
            hasBase ? '가중치 변??????' : '가중치 변???�습 결과)',
            style: const TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 8),
          Text(
            hasBase
                ? '?????�작 ?�점 / ???�재. ?�자?�면 �?증거�???중요?�게 �?'
                : '1.00 ??기본�? ?�을?�록 ??중요?�게 반영??',
            style: const TextStyle(color: Colors.white54, fontSize: 11),
          ),
          const SizedBox(height: 10),
          ...top.map((e) => _row(e.key, e.value, base[e.key] ?? 1.0, hasBase)),
        ],
      ),
    );
  }

  Widget _row(String key, double now, double base, bool hasBase) {
    final delta = now - base;
    final sign = delta >= 0 ? '+' : '';
    final pct = (delta * 100).toStringAsFixed(0);

    final norm = ((now - 0.5) / 1.0).clamp(0.0, 1.0);

    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  key,
                  style: const TextStyle(color: Colors.white70, fontSize: 11, fontWeight: FontWeight.bold),
                ),
              ),
              Text(now.toStringAsFixed(2),
                  style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.bold)),
              const SizedBox(width: 8),
              Text(hasBase ? '($sign$pct%)' : '(${sign}${((now - 1.0) * 100).toStringAsFixed(0)}%)',
                  style: const TextStyle(color: Colors.white54, fontSize: 11)),
            ],
          ),
          if (hasBase)
            Padding(
              padding: const EdgeInsets.only(top: 2),
              child: Text('??${base.toStringAsFixed(2)}  ?? ??${now.toStringAsFixed(2)}',
                  style: const TextStyle(color: Colors.white38, fontSize: 10)),
            ),
          const SizedBox(height: 6),
          ClipRRect(
            borderRadius: BorderRadius.circular(999),
            child: LinearProgressIndicator(
              value: norm,
              backgroundColor: Colors.white.withOpacity(0.08),
              valueColor: const AlwaysStoppedAnimation<Color>(Colors.cyanAccent),
              minHeight: 8,
            ),
          )
        ],
      ),
    );
  }
}