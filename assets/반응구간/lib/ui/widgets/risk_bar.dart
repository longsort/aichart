
import 'package:flutter/material.dart';

class RiskBar extends StatelessWidget {
  final double equity;
  final double usedPct;
  final double maxPct;
  const RiskBar({super.key, required this.equity, required this.usedPct, this.maxPct = 5.0});

  @override
  Widget build(BuildContext context) {
    final ratio = (maxPct <= 0) ? 0.0 : (usedPct / maxPct).clamp(0.0, 1.0);
    final cs = Theme.of(context).colorScheme;
    final color = ratio >= 1.0 ? cs.error : (ratio >= 0.7 ? cs.tertiary : cs.primary);

    return Container(
      height: 46,
      padding: const EdgeInsets.symmetric(horizontal: 16),
      decoration: BoxDecoration(
        color: Colors.black.withOpacity(0.25),
        border: Border(top: BorderSide(color: Colors.grey.shade900)),
      ),
      child: Row(
        children: [
          Text('Equity ${equity.toStringAsFixed(0)}', style: const TextStyle(fontWeight: FontWeight.w700)),
          const SizedBox(width: 12),
          Expanded(
            child: ClipRRect(
              borderRadius: BorderRadius.circular(999),
              child: LinearProgressIndicator(value: ratio, minHeight: 10),
            ),
          ),
          const SizedBox(width: 12),
          Text('${usedPct.toStringAsFixed(1)}% / ${maxPct.toStringAsFixed(1)}%', style: TextStyle(color: color, fontWeight: FontWeight.w800)),
        ],
      ),
    );
  }
}
