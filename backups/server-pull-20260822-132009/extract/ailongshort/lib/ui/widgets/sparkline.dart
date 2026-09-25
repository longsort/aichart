import 'dart:math';
import 'package:flutter/material.dart';

class Sparkline extends StatelessWidget {
  final List<double> data;
  const Sparkline({super.key, required this.data});

  @override
  Widget build(BuildContext context) {
    return CustomPaint(
      painter: _SparklinePainter(data: data),
      size: const Size(double.infinity, double.infinity),
    );
  }
}

class _SparklinePainter extends CustomPainter {
  final List<double> data;
  _SparklinePainter({required this.data});

  @override
  void paint(Canvas canvas, Size size) {
    if (data.length < 2) return;

    final minV = data.reduce(min);
    final maxV = data.reduce(max);
    final span = (maxV - minV).abs() < 1e-9 ? 1.0 : (maxV - minV);

    final paintLine = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2.0
      ..color = Colors.white.withOpacity(0.85);

    final path = Path();
    for (int i = 0; i < data.length; i++) {
      final x = size.width * (i / (data.length - 1));
      final y = size.height * (1.0 - ((data[i] - minV) / span));
      if (i == 0) path.moveTo(x, y);
      else path.lineTo(x, y);
    }
    canvas.drawPath(path, paintLine);
  }

  @override
  bool shouldRepaint(covariant _SparklinePainter oldDelegate) {
    return oldDelegate.data != data;
  }
}
