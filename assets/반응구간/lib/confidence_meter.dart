
import 'package:flutter/material.dart';

class ConfidenceMeter extends StatelessWidget {
  final double confidence; // 0.0 ~ 1.0
  const ConfidenceMeter({super.key, required this.confidence});

  @override
  Widget build(BuildContext context) {
    final pct = (confidence * 100).round();
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          "$pct%",
          style: const TextStyle(
            fontSize: 28,
            fontWeight: FontWeight.w900,
            color: Colors.white,
          ),
        ),
        const SizedBox(height: 4),
        Container(
          width: 120,
          height: 6,
          decoration: BoxDecoration(
            color: Colors.white.withOpacity(0.15),
            borderRadius: BorderRadius.circular(6),
          ),
          child: FractionallySizedBox(
            alignment: Alignment.centerLeft,
            widthFactor: confidence.clamp(0.0, 1.0),
            child: Container(
              decoration: BoxDecoration(
                color: _color(confidence),
                borderRadius: BorderRadius.circular(6),
              ),
            ),
          ),
        ),
      ],
    );
  }

  Color _color(double c) {
    if (c >= 0.75) return const Color(0xFF3FD6C6); // strong
    if (c >= 0.55) return const Color(0xFFD6C36F); // mid
    return const Color(0xFFB35A5A); // weak
  }
}
