
import 'package:flutter/material.dart';

class FutureWavePainter extends CustomPainter {
  final List<Offset> mainPath;
  final List<Offset> altPath;

  FutureWavePainter({
    required this.mainPath,
    required this.altPath,
  });

  @override
  void paint(Canvas c, Size s) {
    final main = Paint()
      ..color = Colors.cyanAccent.withOpacity(0.9)
      ..strokeWidth = 2
      ..style = PaintingStyle.stroke;

    final alt = Paint()
      ..color = Colors.white38
      ..strokeWidth = 1
      ..style = PaintingStyle.stroke;

    _draw(c, mainPath, main);
    _draw(c, altPath, alt);
  }

  void _draw(Canvas c, List<Offset> pts, Paint p) {
    if (pts.length < 2) return;
    final path = Path()..moveTo(pts.first.dx, pts.first.dy);
    for (final o in pts.skip(1)) path.lineTo(o.dx, o.dy);
    c.drawPath(path, p);
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => true;
}
