import 'package:flutter/material.dart';
import 'package:ailongshort/engine/risk/risk_sizing.dart';

class PositionSizingCard extends StatelessWidget {
  final double balance;
  final double entry;
  final double sl;

  const PositionSizingCard({
    super.key,
    required this.balance,
    required this.entry,
    required this.sl,
  });

  @override
  Widget build(BuildContext context) {
    final s = RiskSizing.size(balance: balance, entry: entry, sl: sl);
    final riskAmount = (s['riskAmount'] ?? 0.0) as double;
    final qty = (s['qty'] ?? 0.0) as double;
    final lev = (s['leverage'] ?? 1) as int;

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
          const Text('?¬ì???(5% ë¦¬ìŠ¤??', style: TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.bold)),
          const SizedBox(height: 8),
          _row('?”ê³ ', balance.toStringAsFixed(2)),
          _row('ë¦¬ìŠ¤?¬ê¸ˆ??, riskAmount.toStringAsFixed(2)),
          _row('?˜ëŸ‰', qty.toStringAsFixed(6)),
          _row('?ˆë²„ë¦¬ì?', '${lev}ë°?),
        ],
      ),
    );
  }

  Widget _row(String k, String v) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Row(
        children: [
          SizedBox(width: 80, child: Text(k, style: const TextStyle(color: Colors.white70, fontSize: 12))),
          Text(v, style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.bold)),
        ],
      ),
    );
  }
}