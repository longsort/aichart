import 'package:flutter/material.dart';
import 'package:ailongshort/engine/ai/entry_plan.dart';

class EntryPlanCard extends StatelessWidget {
  final String decision;
  final double price;
  final int evidenceHit;
  final double atr;

  const EntryPlanCard({
    super.key,
    required this.decision,
    required this.price,
    required this.evidenceHit,
    this.atr = 1.0,
  });

  @override
  Widget build(BuildContext context) {
    final plan = buildPlan(
      price: price,
      decision: decision,
      evidenceHit: evidenceHit,
      atr: atr,
    );

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
          Row(
            children: [
              const Icon(Icons.place, size: 16, color: Colors.white),
              const SizedBox(width: 8),
              const Text('진입 계획', style: TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.bold)),
              const Spacer(),
              Text(decision == 'NO-TRADE' ? '매매금�?' : decision, style: const TextStyle(color: Colors.white70, fontSize: 12)),
            ],
          ),
          const SizedBox(height: 10),
          _row('진입 가�?, plan.entry),
          _row('?�절 가�?, plan.sl),
          if (plan.tps.isNotEmpty) ...[
            const SizedBox(height: 6),
            _row('목표1', plan.tps[0]),
            if (plan.tps.length > 1) _row('목표2', plan.tps[1]),
            if (plan.tps.length > 2) _row('목표3', plan.tps[2]),
          ],
          const SizedBox(height: 8),
          Text('?�익 비율 ~ ${plan.rr.toStringAsFixed(2)}', style: const TextStyle(color: Colors.white54, fontSize: 11)),
        ],
      ),
    );
  }

  Widget _row(String k, double v) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 4),
      child: Row(
        children: [
          SizedBox(width: 44, child: Text(k, style: const TextStyle(color: Colors.white70, fontSize: 12))),
          Text(v.toStringAsFixed(2), style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.bold)),
        ],
      ),
    );
  }
}