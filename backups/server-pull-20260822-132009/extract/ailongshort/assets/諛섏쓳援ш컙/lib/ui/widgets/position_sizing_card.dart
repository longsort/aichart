import 'package:flutter/material.dart';
import 'package:fulink_pro_ultra/engine/risk/risk_sizing.dart';

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
          const Text('포지션 (5% 리스크)', style: TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.bold)),
          const SizedBox(height: 8),
          _row('잔고', balance.toStringAsFixed(2)),
          _row('리스크금액', riskAmount.toStringAsFixed(2)),
          _row('수량', qty.toStringAsFixed(6)),
          _row('레버리지', '${lev}배'),
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