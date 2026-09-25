import 'package:flutter/material.dart';

class HudGaugeBar extends StatelessWidget {
  final double value01; // 0..1 (0 short, 0.5 neutral, 1 long)
  final bool locked;
  const HudGaugeBar({super.key, required this.value01, this.locked=false});

  @override
  Widget build(BuildContext context) {
    final v = value01.clamp(0.0, 1.0);
    final left = (0.5 - v).clamp(0.0, 0.5) * 2;   // short strength 0..1
    final right = (v - 0.5).clamp(0.0, 0.5) * 2;  // long strength 0..1

    final cShort = locked ? Colors.grey : const Color(0xFFFF4D4D);
    final cLong  = locked ? Colors.grey : const Color(0xFF57FFB0);

    return ClipRRect(
      borderRadius: BorderRadius.circular(14),
      child: Container(
        height: 12,
        color: Colors.white.withOpacity(0.07),
        child: Stack(
          children: [
            Align(
              alignment: Alignment.centerLeft,
              child: FractionallySizedBox(
                widthFactor: left,
                child: Container(color: cShort.withOpacity(0.85)),
              ),
            ),
            Align(
              alignment: Alignment.centerRight,
              child: FractionallySizedBox(
                widthFactor: right,
                child: Container(color: cLong.withOpacity(0.85)),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
