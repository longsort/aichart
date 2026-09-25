
import 'package:flutter/material.dart';

class KeyZoneCard extends StatelessWidget {
  final double support;
  final double resistance;

  const KeyZoneCard({super.key, required this.support, required this.resistance});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.blueGrey.withOpacity(0.15),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text("?�심 구간", style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
          const SizedBox(height: 8),
          Text("막힐 가?�성: ${resistance.toStringAsFixed(1)}"),
          Text("지켜야 ??구간: ${support.toStringAsFixed(1)}"),
        ],
      ),
    );
  }
}
