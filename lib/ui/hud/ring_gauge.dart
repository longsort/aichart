import 'dart:math';
import 'package:flutter/material.dart';

class RingGauge extends StatelessWidget {
  final double value01;
  final Color color;
  final double size;
  final double stroke;

  const RingGauge({
    super.key,
    required this.value01,
    required this.color,
    this.size = 34,
    this.stroke = 3.2,
  });

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: size,
      height: size,
      child: CustomPaint(
        painter: _RingPainter(value01: value01, color: color, stroke: stroke),
      ),
    );
  }
}

class _RingPainter extends CustomPainter {
  final double value01;
  final Color color;
  final double stroke;

  _RingPainter({required this.value01, required this.color, required this.stroke});

  @override
  void paint(Canvas canvas, Size size) {
    final r = min(size.width, size.height) / 2;
    final c = Offset(size.width / 2, size.height / 2);

    final bg = Paint()
      ..color = Colors.white10
      ..style = PaintingStyle.stroke
      ..strokeWidth = stroke;

    canvas.drawCircle(c, r - stroke, bg);

    final fg = Paint()
      ..color = color.withOpacity(0.95)
      ..style = PaintingStyle.stroke
      ..strokeWidth = stroke
      ..strokeCap = StrokeCap.round;

    final start = -pi / 2;
    final sweep = (value01.clamp(0.0, 1.0)) * 2 * pi;
    canvas.drawArc(Rect.fromCircle(center: c, radius: r - stroke), start, sweep, false, fg);
  }

  @override
  bool shouldRepaint(covariant _RingPainter oldDelegate) {
    return oldDelegate.value01 != value01 || oldDelegate.color != color || oldDelegate.stroke != stroke;
  }
}
