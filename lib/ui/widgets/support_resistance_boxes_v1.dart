
import 'package:flutter/material.dart';

class SupportResistanceBoxesV1 extends StatelessWidget {
  final double supportPrice;
  final int supportProb; // 0~100
  final double resistPrice;
  final int resistProb; // 0~100

  const SupportResistanceBoxesV1({
    super.key,
    required this.supportPrice,
    required this.supportProb,
    required this.resistPrice,
    required this.resistProb,
  });

  @override
  Widget build(BuildContext context) {
    Widget box(String label, double price, int prob) {
      return Expanded(
        child: Container(
          padding: const EdgeInsets.all(10),
          decoration: BoxDecoration(
            color: Colors.white.withOpacity(0.06),
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: Colors.white24),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(label, style: const TextStyle(color: Colors.white70, fontSize: 12)),
              const SizedBox(height: 6),
              Text(price.toStringAsFixed(1),
                  style: const TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.w900)),
              const SizedBox(height: 4),
              Text('?•ë¥  ${prob.clamp(0,100)}%',
                  style: const TextStyle(color: Colors.white60, fontSize: 12)),
            ],
          ),
        ),
      );
    }

    return Row(
      children: [
        box('ì§€ì§€', supportPrice, supportProb),
        const SizedBox(width: 10),
        box('?€??, resistPrice, resistProb),
      ],
    );
  }
}
