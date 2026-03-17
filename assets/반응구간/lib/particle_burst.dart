
import 'dart:math';
import 'package:flutter/material.dart';
import 'state_engine.dart';

class ParticleBurst extends StatelessWidget {
  final MarketState state;
  final double pulse; // 0..1
  const ParticleBurst({super.key, required this.state, required this.pulse});

  @override
  Widget build(BuildContext context) {
    if (state != MarketState.energy && state != MarketState.danger) {
      return const SizedBox.shrink();
    }
    return CustomPaint(painter: _BurstPainter(state: state, pulse: pulse));
  }
}

class _BurstPainter extends CustomPainter {
  final MarketState state;
  final double pulse;
  _BurstPainter({required this.state, required this.pulse});

  @override
  void paint(Canvas canvas, Size size) {
    final c = size.center(Offset.zero);
    final r = min(size.width, size.height) * 0.48;
    final count = state == MarketState.energy ? 60 : 110;

    final glow = Paint()
      ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 6);

    for (int i = 0; i < count; i++) {
      final u = i / count;
      final ang = (2 * pi) * u + (pulse * 2 * pi);
      final rr = r * (0.65 + 0.25 * sin((u * 14 * pi) + (pulse * 2 * pi)));
      final p = Offset(c.dx + cos(ang) * rr, c.dy + sin(ang) * rr);

      final col = state == MarketState.danger
          ? const Color(0xFFFF0033)
          : const Color(0xFF00FFD1);

      glow.color = col.withOpacity(0.05 + 0.18 * pulse);
      canvas.drawCircle(p, 1.0 + 2.2 * pulse, glow);
    }
  }

  @override
  bool shouldRepaint(covariant _BurstPainter oldDelegate) => true;
}
