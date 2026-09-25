
import 'package:flutter/material.dart';

class SmcOverlayPainter extends CustomPainter {
  final List<Rect> fvg;
  final List<Rect> ob;
  final List<Offset> choch;
  final List<Offset> bos;

  SmcOverlayPainter({
    required this.fvg,
    required this.ob,
    required this.choch,
    required this.bos,
  });

  @override
  void paint(Canvas c, Size s) {
    final pFvg = Paint()..color = Colors.teal.withOpacity(0.22);
    final pOb = Paint()..color = Colors.orange.withOpacity(0.22);
    final pPoint = Paint()
      ..color = Colors.white70
      ..strokeWidth = 1;

    for (final r in fvg) {
      c.drawRect(r, pFvg);
      c.drawRect(r.deflate(-0.5), Paint()..color = Colors.teal.withOpacity(0.5)..style = PaintingStyle.stroke);
    }
    for (final r in ob) {
      c.drawRect(r, pOb);
      c.drawRect(r.deflate(-0.5), Paint()..color = Colors.orange.withOpacity(0.5)..style = PaintingStyle.stroke);
    }
    for (final o in choch) c.drawCircle(o, 4, pPoint);
    for (final o in bos) c.drawCircle(o, 4, pPoint);
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => true;
}
