import 'package:flutter/material.dart';

class PositionProgressGauge extends StatelessWidget {
  final String decision; // LONG/SHORT/NO-TRADE
  final double price;
  final double entry;
  final double sl;
  final double? tp;

  const PositionProgressGauge({
    super.key,
    required this.decision,
    required this.price,
    required this.entry,
    required this.sl,
    required this.tp,
  });

  @override
  Widget build(BuildContext context) {
    final d = decision.toUpperCase();
    if (d != 'LONG' && d != 'SHORT') {
      return const SizedBox.shrink();
    }
    final target = tp ?? entry;

    // progress: entry -> target (LONG increases, SHORT decreases)
    double t0 = entry;
    double t1 = target;

    // Avoid degenerate
    if ((t1 - t0).abs() < 1e-9) {
      t1 = d == 'LONG' ? t0 * 1.001 : t0 * 0.999;
    }

    final raw = d == 'LONG'
        ? (price - t0) / (t1 - t0)
        : (t0 - price) / (t0 - t1);

    final progress = raw.clamp(0.0, 1.0);

    final isBelowEntry = d == 'LONG' ? price < entry : price > entry;
    final reachedTP = d == 'LONG' ? price >= target : price <= target;
    final hitSL = d == 'LONG' ? price <= sl : price >= sl;

    Color barColor = Colors.green;
    if (hitSL) barColor = Colors.red;
    else if (isBelowEntry) barColor = Colors.orange;
    else if (reachedTP) barColor = Colors.greenAccent;

    final label = hitSL
        ? '?�절 구간'
        : reachedTP
            ? '목표 ?�성'
            : isBelowEntry
                ? '진입 ?�래'
                : '진입 ??;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            const Text('진행', style: TextStyle(color: Colors.white70, fontSize: 11)),
            const SizedBox(width: 8),
            Text(label, style: TextStyle(color: barColor.withOpacity(0.95), fontSize: 11)),
          ],
        ),
        const SizedBox(height: 6),
        ClipRRect(
          borderRadius: BorderRadius.circular(10),
          child: LinearProgressIndicator(
            value: progress,
            minHeight: 10,
            backgroundColor: Colors.white.withOpacity(0.10),
            valueColor: AlwaysStoppedAnimation<Color>(barColor),
          ),
        ),
        const SizedBox(height: 6),
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text('?�절 ${_fmt(sl)}', style: const TextStyle(color: Colors.white54, fontSize: 10)),
            Text('진입 ${_fmt(entry)}', style: const TextStyle(color: Colors.white54, fontSize: 10)),
            Text('목표 ${_fmt(target)}', style: const TextStyle(color: Colors.white54, fontSize: 10)),
          ],
        ),
      ],
    );
  }

  String _fmt(double v) => v.isFinite ? v.toStringAsFixed(2) : '-';
}
