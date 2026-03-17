import 'package:flutter/material.dart';

class ProbBar extends StatelessWidget {
  final String label;
  final int value; // 0~100
  const ProbBar({super.key, required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    final v = value.clamp(0, 100);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text("$label  $v%", style: const TextStyle(fontSize: 12)),
        const SizedBox(height: 6),
        ClipRRect(
          borderRadius: BorderRadius.circular(999),
          child: LinearProgressIndicator(
            value: v / 100.0,
            minHeight: 10,
          ),
        ),
      ],
    );
  }
}
