
import 'package:flutter/material.dart';

class AutoPlanCard extends StatelessWidget {
  final double entry;
  final double stop;
  final double target;

  const AutoPlanCard({super.key, required this.entry, required this.stop, required this.target});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.deepPurple.withOpacity(0.15),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text("?�동 ?�계 ?�약", style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
          const SizedBox(height: 8),
          Text("진입: ${entry.toStringAsFixed(1)}"),
          Text("?�절: ${stop.toStringAsFixed(1)}"),
          Text("목표: ${target.toStringAsFixed(1)}"),
        ],
      ),
    );
  }
}
