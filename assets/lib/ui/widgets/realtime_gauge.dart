import 'package:flutter/material.dart';

class RealtimeGauge extends StatelessWidget {
  final double value;
  final String label;

  const RealtimeGauge({super.key, required this.value, this.label = ''});

  @override
  Widget build(BuildContext context) {
    return TweenAnimationBuilder<double>(
      tween: Tween<double>(begin: 0, end: value.clamp(0, 100)),
      duration: const Duration(milliseconds: 400),
      curve: Curves.easeOutCubic,
      builder: (context, v, _) {
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (label.isNotEmpty)
              Text(label, style: const TextStyle(fontSize: 12)),
            const SizedBox(height: 4),
            Container(
              height: 10,
              width: double.infinity,
              decoration: BoxDecoration(
                color: Colors.white12,
                borderRadius: BorderRadius.circular(6),
              ),
              child: FractionallySizedBox(
                alignment: Alignment.centerLeft,
                widthFactor: v / 100,
                child: Container(
                  decoration: BoxDecoration(
                    color: v >= 50 ? Colors.greenAccent : Colors.orangeAccent,
                    borderRadius: BorderRadius.circular(6),
                  ),
                ),
              ),
            ),
          ],
        );
      },
    );
  }
}