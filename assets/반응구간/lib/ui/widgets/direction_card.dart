
import 'package:flutter/material.dart';

class DirectionCard extends StatelessWidget {
  final String title;
  final String reason;
  final Color color;

  const DirectionCard({
    super.key,
    required this.title,
    required this.reason,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: color.withOpacity(0.15),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: color),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold, color: color)),
          const SizedBox(height: 8),
          Text(reason, style: const TextStyle(fontSize: 14)),
        ],
      ),
    );
  }
}
