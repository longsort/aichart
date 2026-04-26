import 'dart:math';
import 'package:flutter/material.dart';

class PulseSpark extends StatelessWidget {
  final List<double> values; // 0~1
  const PulseSpark({super.key, required this.values});

  @override
  Widget build(BuildContext context) {
    return CustomPaint(
      painter: _SparkPainter(values),
      child: const SizedBox(height: 62, width: double.infinity),
    );
  }
}

class _SparkPainter extends CustomPainter {
  final List<double> v;
  _SparkPainter(this.v);

  @override
  void paint(Canvas canvas, Size size) {
    final bg = Paint()..color = Colors.white.withOpacity(0.04);
    canvas.drawRRect(
      RRect.fromRectAndRadius(Offset.zero & size, const Radius.circular(14)),
      bg,
    );

    if (v.isEmpty) return;

    final path = Path();
    final n = max(2, v.length);
    for (int i = 0; i < v.length; i++) {
      final x = (i / (n - 1)) * size.width;
      final y = size.height * (1 - v[i].clamp(0.0, 1.0));
      if (i == 0) {
        path.moveTo(x, y);
      } else {
        path.lineTo(x, y);
      }
    }

    final glow = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 5
      ..strokeCap = StrokeCap.round
      ..color = Colors.cyanAccent.withOpacity(0.18);

    canvas.drawPath(path, glow);

    final line = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2
      ..strokeCap = StrokeCap.round
      ..color = Colors.cyanAccent.withOpacity(0.75);

    canvas.drawPath(path, line);
  }

  @override
  bool shouldRepaint(covariant _SparkPainter oldDelegate) => oldDelegate.v != v;
}
