
import 'package:flutter/material.dart';
import 'neon_theme.dart';

class ScenarioPathV1 extends StatelessWidget {
  final String badge; // B/S/W
  final double settle;
  final double now;
  final double target1;
  final double target2;
  final double invalid;
  final double height;

  const ScenarioPathV1({
    super.key,
    required this.badge,
    required this.settle,
    required this.now,
    required this.target1,
    required this.target2,
    required this.invalid,
    this.height = 58,
  });

  @override
  Widget build(BuildContext context) {
    final t = NeonTheme.of(context);
    Color c = t.muted;
    if (badge == 'B') c = t.good;
    if (badge == 'S') c = t.bad;

    return SizedBox(
      height: height,
      child: CustomPaint(
        painter: _ScenarioPainter(
          color: c,
          settle: settle,
          now: now,
          t1: target1,
          t2: target2,
          invalid: invalid,
          bg: t.bg.withOpacity(0.2),
          line: t.border.withOpacity(0.22),
        ),
      ),
    );
  }
}

class _ScenarioPainter extends CustomPainter {
  final Color color;
  final Color bg;
  final Color line;
  final double settle, now, t1, t2, invalid;

  _ScenarioPainter({
    required this.color,
    required this.settle,
    required this.now,
    required this.t1,
    required this.t2,
    required this.invalid,
    required this.bg,
    required this.line,
  });

  @override
  void paint(Canvas canvas, Size size) {
    final paintBg = Paint()..color = bg;
    canvas.drawRRect(RRect.fromRectAndRadius(Offset.zero & size, const Radius.circular(12)), paintBg);

    final midY = size.height * 0.55;
    final left = 10.0;
    final right = size.width - 10.0;

    // base line
    final pLine = Paint()
      ..color = line
      ..strokeWidth = 1;
    canvas.drawLine(Offset(left, midY), Offset(right, midY), pLine);

    // scenario path: solid primary, dashed fail
    final p = Paint()
      ..color = color.withOpacity(0.9)
      ..strokeWidth = 2
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round;

    final fail = Paint()
      ..color = color.withOpacity(0.4)
      ..strokeWidth = 2
      ..style = PaintingStyle.stroke;

    final path = Path();
    path.moveTo(left, midY);
    // up or down
    final up = (badge == 'B');
    final dx1 = (right - left) * 0.45;
    final dx2 = (right - left) * 0.85;

    final y1 = up ? midY - size.height * 0.22 : midY + size.height * 0.22;
    final y2 = up ? midY - size.height * 0.34 : midY + size.height * 0.34;

    path.quadraticBezierTo(left + dx1, y1, left + dx2, y2);
    canvas.drawPath(path, p);

    // fail path (opposite)
    final fpath = Path();
    fpath.moveTo(left, midY);
    final fy = up ? midY + size.height * 0.25 : midY - size.height * 0.25;
    fpath.quadraticBezierTo(left + dx1, fy, right - 10, fy);
    _drawDashed(canvas, fpath, fail, 6, 4);

    // dots: settle & invalid markers
    _dot(canvas, Offset(left + (right-left)*0.20, midY), color.withOpacity(0.6));
    _dot(canvas, Offset(left + (right-left)*0.20, up? midY + 12: midY - 12), color.withOpacity(0.35));

    // small labels (no numbers to keep compact)
    final tp = TextPainter(textDirection: TextDirection.ltr);
    tp.text = TextSpan(text: 'T', style: TextStyle(color: color.withOpacity(0.9), fontSize: 10, fontWeight: FontWeight.w900));
    tp.layout();
    tp.paint(canvas, Offset(right - 14, y2 - 6));

    final sp = TextPainter(textDirection: TextDirection.ltr);
    sp.text = TextSpan(text: 'X', style: TextStyle(color: color.withOpacity(0.7), fontSize: 10, fontWeight: FontWeight.w900));
    sp.layout();
    sp.paint(canvas, Offset(right - 14, fy - 6));
  }

  void _dot(Canvas canvas, Offset o, Color c){
    canvas.drawCircle(o, 3.5, Paint()..color=c);
  }

  void _drawDashed(Canvas canvas, Path path, Paint paint, double dash, double gap) {
    for (final m in path.computeMetrics()) {
      double dist = 0;
      while (dist < m.length) {
        final len = dash;
        final extract = m.extractPath(dist, dist + len);
        canvas.drawPath(extract, paint);
        dist += dash + gap;
      }
    }
  }

  @override
  bool shouldRepaint(covariant _ScenarioPainter oldDelegate) {
    return oldDelegate.color != color ||
        oldDelegate.settle != settle ||
        oldDelegate.now != now ||
        oldDelegate.t1 != t1 ||
        oldDelegate.t2 != t2 ||
        oldDelegate.invalid != invalid;
  }
}
