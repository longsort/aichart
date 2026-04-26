
import 'dart:math';
import 'package:flutter/material.dart';
import 'future_core.dart';

class ScenarioRing extends StatelessWidget {
  final List<Scenario> scenarios;
  final double pulse; // 0..1
  const ScenarioRing({super.key, required this.scenarios, required this.pulse});

  @override
  Widget build(BuildContext context) {
    if (scenarios.isEmpty) return const SizedBox.shrink();
    return CustomPaint(
      painter: _ScenarioRingPainter(scenarios: scenarios, pulse: pulse),
    );
  }
}

class _ScenarioRingPainter extends CustomPainter {
  final List<Scenario> scenarios;
  final double pulse;
  _ScenarioRingPainter({required this.scenarios, required this.pulse});

  @override
  void paint(Canvas canvas, Size size) {
    final c = size.center(Offset.zero);
    final r = min(size.width, size.height) * 0.46;

    // rotate slowly for "alive" ?ë‚Œ
    canvas.save();
    canvas.translate(c.dx, c.dy);
    canvas.rotate((pulse - 0.5) * 0.35);
    canvas.translate(-c.dx, -c.dy);

    final base = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 10
      ..color = Colors.white.withOpacity(0.06);
    canvas.drawCircle(c, r, base);

    double start = -pi / 2;
    for (final s in scenarios) {
      final sweep = (2 * pi) * s.p;
      final paint = Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 10
        ..strokeCap = StrokeCap.round
        ..color = _colorFor(s.id).withOpacity(0.75 + 0.20 * pulse);
      canvas.drawArc(Rect.fromCircle(center: c, radius: r), start, sweep, false, paint);

      // tiny label dot
      final ang = start + sweep;
      final dot = Offset(c.dx + cos(ang) * r, c.dy + sin(ang) * r);
      final dp = Paint()
        ..color = _colorFor(s.id).withOpacity(0.9)
        ..maskFilter = MaskFilter.blur(BlurStyle.normal, 6);
      canvas.drawCircle(dot, 2.2 + 1.5 * pulse, dp);

      start += sweep;
    }

    canvas.restore();
  }

  Color _colorFor(String id) {
    switch (id) {
      case "A":
        return const Color(0xFF00FFD1); // up-pullback
      case "B":
        return const Color(0xFFFFFF00); // sideways
      case "C":
        return const Color(0xFFFF2A6D); // breakdown
      default:
        return Colors.white;
    }
  }

  @override
  bool shouldRepaint(covariant _ScenarioRingPainter oldDelegate) => true;
}
