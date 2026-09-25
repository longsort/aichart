
import 'dart:math';
import 'package:flutter/material.dart';
import 'state_engine.dart';

class OverdriveLayer extends StatelessWidget {
  final MarketState state;
  final double intensity; // 0..1
  const OverdriveLayer({super.key, required this.state, required this.intensity});

  @override
  Widget build(BuildContext context) {
    double glow;
    Color color;

    switch (state) {
      case MarketState.energy:
        glow = 0.6 + intensity * 0.8;
        color = Colors.cyanAccent;
        break;
      case MarketState.danger:
        glow = 1.0;
        color = Colors.redAccent;
        break;
      case MarketState.uncertain:
        glow = 0.4;
        color = Colors.orangeAccent;
        break;
      default:
        glow = 0.2;
        color = Colors.greenAccent;
    }

    return IgnorePointer(
      child: AnimatedOpacity(
        duration: const Duration(milliseconds: 600),
        opacity: glow.clamp(0.0, 1.0),
        child: Container(
          decoration: BoxDecoration(
            gradient: RadialGradient(
              colors: [
                color.withOpacity(0.35),
                Colors.transparent,
              ],
              radius: 0.85,
            ),
          ),
        ),
      ),
    );
  }
}
