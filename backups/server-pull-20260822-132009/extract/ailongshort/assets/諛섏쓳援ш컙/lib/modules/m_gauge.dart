import 'dart:math';
import 'package:flutter/material.dart';
import '../common.dart';

class ModGauge extends StatefulWidget {
  const ModGauge({super.key});
  @override
  State<ModGauge> createState() => _ModGaugeState();
}

class _ModGaugeState extends State<ModGauge> with SingleTickerProviderStateMixin {
  late AnimationController a;
  double value = 0.72;

  @override
  void initState() {
    super.initState();
    a = AnimationController(vsync: this, duration: const Duration(milliseconds: 1800))
      ..repeat(reverse: true);
  }

  @override
  void dispose() {
    a.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final p = sin(a.value * pi).abs();
    return Scaffold(
      backgroundColor: bg,
      appBar: AppBar(backgroundColor: bg, title: const Text("Cinematic Gauge"), foregroundColor: Colors.white),
      body: Center(
        child: Stack(
          alignment: Alignment.center,
          children: [
            Container(
              width: 320,
              height: 320,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                boxShadow: [
                  BoxShadow(
                    color: Colors.tealAccent.withOpacity(0.18 + 0.22 * p),
                    blurRadius: 120,
                    spreadRadius: 28,
                  )
                ],
              ),
            ),
            Container(
              width: 240,
              height: 240,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                border: Border.all(color: Colors.white12, width: 2),
              ),
              child: Center(
                child: Text(
                  "${(value * 100).round()}%",
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 48,
                    fontWeight: FontWeight.w900,
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
