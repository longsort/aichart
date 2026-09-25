import 'package:flutter/material.dart';

class Sparkline extends StatelessWidget {
  final List<double> values;
  final Color color;
  final double height;

  const Sparkline({super.key, required this.values, required this.color, this.height = 16});

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: height,
      child: CustomPaint(painter: _SparkPainter(values: values, color: color)),
    );
  }
}

class _SparkPainter extends CustomPainter {
  final List<double> values;
  final Color color;

  _SparkPainter({required this.values, required this.color});

  @override
  void paint(Canvas canvas, Size size) {
    final bg = Paint()
      ..color = Colors.white10
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1;

    canvas.drawLine(Offset(0, size.height * 0.5), Offset(size.width, size.height * 0.5), bg);
    if (values.length < 2) return;

    final paint = Paint()
      ..color = color.withOpacity(0.9)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2
      ..strokeCap = StrokeCap.round;

    final path = Path();
    for (int i = 0; i < values.length; i++) {
      final t = i / (values.length - 1);
      final x = t * size.width;
      final v = values[i].clamp(0.0, 1.0);
      final y = (1 - v) * size.height;
      if (i == 0) path.moveTo(x, y);
      else path.lineTo(x, y);
    }
    canvas.drawPath(path, paint);

    final last = values.last.clamp(0.0, 1.0);
    canvas.drawCircle(Offset(size.width, (1 - last) * size.height), 2.4, Paint()..color = color);
  }

  @override
  bool shouldRepaint(covariant _SparkPainter oldDelegate) =>
      oldDelegate.values != values || oldDelegate.color != color;
}
