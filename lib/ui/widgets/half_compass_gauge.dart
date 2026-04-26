import 'dart:math';
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import '../../pipe/snapshot.dart';

class HalfCompassGauge extends StatelessWidget {
  final EngineSnapshot snap;
  const HalfCompassGauge({super.key, required this.snap});

  @override
  Widget build(BuildContext context) {
    return CustomPaint(
      painter: _Painter(snap),
      size: const Size(double.infinity, 180),
    );
  }
}

class _Painter extends CustomPainter {
  final EngineSnapshot s;
  _Painter(this.s);

  @override
  void paint(Canvas canvas, Size size) {
    final w = size.width;
    final h = size.height;
    final c = Offset(w / 2, h * 0.98);
    final r = min(w * 0.46, h * 0.98);

    final longPct = s.longPct.clamp(0.0, 1.0);
    final shortPct = s.shortPct.clamp(0.0, 1.0);

    const green = Color(0xFF00FF7A);
    const red = Color(0xFFFF2D55);

    final rect = Rect.fromCircle(center: c, radius: r);

    // base arc
    canvas.drawArc(
      rect,
      pi,
      pi,
      false,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 18
        ..color = Colors.white.withOpacity(0.07),
    );

    final glow = (0.25 + 0.60 * s.confidence).clamp(0.25, 0.90).toDouble();
    final sw = 16.0;

    Paint seg(Color color) => Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = sw
      ..strokeCap = StrokeCap.round
      ..color = color.withOpacity(0.55 + 0.35 * glow)
      ..maskFilter = MaskFilter.blur(BlurStyle.normal, 10 + 18 * glow);

    // red left portion, green right portion on the half arc (top side)
    canvas.drawArc(rect, pi, pi * shortPct, false, seg(red));
    canvas.drawArc(rect, 2 * pi - (pi * longPct), pi * longPct, false, seg(green));

    // ticks
    final tickPaint = Paint()..color = Colors.white.withOpacity(0.10);
    for (int i = 0; i <= 24; i++) {
      final a = pi + (pi * i / 24);
      final p1 = Offset(c.dx + cos(a) * (r - 2), c.dy + sin(a) * (r - 2));
      final p2 = Offset(c.dx + cos(a) * (r - 18), c.dy + sin(a) * (r - 18));
      tickPaint.strokeWidth = (i % 6 == 0) ? 2.0 : 1.0;
      canvas.drawLine(p1, p2, tickPaint);
    }

    // needle: clockwise over TOP from SHORT(left) -> NEUTRAL(top) -> LONG(right)
    final angle = -pi * (1.0 - longPct); // 0..-pi
    final needleLen = (r - 34) * (0.35 + 0.65 * s.consensus);
    final end = Offset(c.dx + cos(angle) * needleLen, c.dy + sin(angle) * needleLen);

    final needleGlow = Paint()
      ..strokeWidth = 7
      ..strokeCap = StrokeCap.round
      ..color = Color.lerp(red, green, longPct)!.withOpacity(0.18 + 0.55 * glow)
      ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 12);

    final needleCore = Paint()
      ..strokeWidth = 2.8
      ..strokeCap = StrokeCap.round
      ..color = Colors.white.withOpacity(0.92);

    canvas.drawLine(c, end, needleGlow);
    canvas.drawLine(c, end, needleCore);

    // hub
    canvas.drawCircle(c, 10, Paint()..color = Colors.black.withOpacity(0.86));
    canvas.drawCircle(c, 10, Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.5
      ..color = Colors.white.withOpacity(0.18));

    // labels
    _label(canvas, Offset(c.dx - r + 24, c.dy - 26), "SHORT");
    _label(canvas, Offset(c.dx + r - 24, c.dy - 26), "LONG");
    _label(canvas, Offset(c.dx, c.dy - r + 24), "NEUTRAL");

    // center text
    final tp = TextPainter(textDirection: TextDirection.ltr);
    tp.text = TextSpan(
      text: "SHORT ${(shortPct * 100).round()}%  /  LONG ${(longPct * 100).round()}%",
      style: TextStyle(fontSize: 12.5, color: Colors.white.withOpacity(0.62)),
    );
    tp.layout();
    tp.paint(canvas, Offset(c.dx - tp.width / 2, c.dy - r * 0.20));
  }

  void _label(Canvas canvas, Offset p, String s) {
    final tp = TextPainter(textDirection: TextDirection.ltr);
    tp.text = TextSpan(
      text: s,
      style: TextStyle(fontSize: 11, color: Colors.white.withOpacity(0.35), letterSpacing: 1.2),
    );
    tp.layout();
    tp.paint(canvas, p - Offset(tp.width / 2, tp.height / 2));
  }

  @override
  bool shouldRepaint(covariant _Painter oldDelegate) => true;
}
