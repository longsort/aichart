
import 'dart:math' as math;
import 'package:flutter/material.dart';

/// Half gauge (0..1) with needle. Designed for dark + neon UI.
class HalfGauge extends StatelessWidget {
  final double value; // 0..1 (0=SHORT side, 1=LONG side)
  final double longPct;
  final double shortPct;
  final String label;
  final double glow;

  const HalfGauge({
    super.key,
    required this.value,
    required this.longPct,
    required this.shortPct,
    required this.label,
    this.glow = 1.0,
  });

  @override
  Widget build(BuildContext context) {
    final v = value.clamp(0.0, 1.0);
    return TweenAnimationBuilder<double>(
      tween: Tween(begin: v, end: v),
      duration: const Duration(milliseconds: 650),
      curve: Curves.easeOutCubic,
      builder: (context, animV, _) {
        return CustomPaint(
          painter: _HalfGaugePainter(
            v: animV,
            glow: glow,
            longPct: longPct,
            shortPct: shortPct,
          ),
          child: SizedBox(
            height: 220,
            width: double.infinity,
            child: Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    label,
                    style: const TextStyle(
                      fontSize: 20,
                      fontWeight: FontWeight.w700,
                      color: Colors.white,
                      letterSpacing: 0.2,
                    ),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    'LONG ${(longPct * 100).toStringAsFixed(0)}%  /  SHORT ${(shortPct * 100).toStringAsFixed(0)}%',
                    style: TextStyle(
                      fontSize: 12,
                      color: Colors.white.withOpacity(0.75),
                      letterSpacing: 0.2,
                    ),
                  ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }
}

class _HalfGaugePainter extends CustomPainter {
  final double v;
  final double longPct;
  final double shortPct;
  final double glow;

  _HalfGaugePainter({
    required this.v,
    required this.longPct,
    required this.shortPct,
    required this.glow,
  });

  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height * 0.92);
    final radius = math.min(size.width, size.height) * 0.46;

    final start = math.pi; // left
    final sweep = math.pi; // half circle

    // Base track
    final trackPaint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 18
      ..strokeCap = StrokeCap.round
      ..color = const Color(0xFF2A2F3A);

    canvas.drawArc(
      Rect.fromCircle(center: center, radius: radius),
      start,
      sweep,
      false,
      trackPaint,
    );

    // Segment colors (short=red on left, long=green on right)
    final grad = SweepGradient(
      startAngle: start,
      endAngle: start + sweep,
      colors: const [
        Color(0xFFFF3B6B),
        Color(0xFFFFA24C),
        Color(0xFF2BFF88),
      ],
      stops: const [0.0, 0.55, 1.0],
      transform: const GradientRotation(0),
    );

    final segPaint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 18
      ..strokeCap = StrokeCap.round
      ..shader = grad.createShader(Rect.fromCircle(center: center, radius: radius));

    // Progress based on v (fill all; but glow intensity based on agreement)
    canvas.drawArc(
      Rect.fromCircle(center: center, radius: radius),
      start,
      sweep,
      false,
      segPaint,
    );

    // Outer thin ring
    final ringPaint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2
      ..color = Colors.white.withOpacity(0.18);

    canvas.drawArc(
      Rect.fromCircle(center: center, radius: radius + 18),
      start,
      sweep,
      false,
      ringPaint,
    );

    // Needle angle: map v 0..1 => pi..0 (left to right)
    final ang = math.pi - (math.pi * v);
    final needleLen = radius * 0.82;
    final tip = center + Offset(math.cos(ang), -math.sin(ang)) * needleLen;

    // Needle glow
    final glowPaint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 10
      ..strokeCap = StrokeCap.round
      ..color = Colors.white.withOpacity(0.08 * glow);

    canvas.drawLine(center, tip, glowPaint);

    // Needle
    final needlePaint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 3.5
      ..strokeCap = StrokeCap.round
      ..color = Colors.white.withOpacity(0.92);

    canvas.drawLine(center, tip, needlePaint);

    // Hub
    final hubPaint = Paint()..color = const Color(0xFF0D0F14);
    canvas.drawCircle(center, 9.5, hubPaint);
    final hubRing = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2
      ..color = Colors.white.withOpacity(0.35);
    canvas.drawCircle(center, 9.5, hubRing);

    // Labels
    final textStyle = TextStyle(
      color: Colors.white.withOpacity(0.65),
      fontSize: 11,
      fontWeight: FontWeight.w600,
      letterSpacing: 0.4,
    );

    _drawText(canvas, 'SHORT', center + Offset(-radius * 0.92, -radius * 0.35), textStyle);
    _drawText(canvas, 'NEUTRAL', center + Offset(0, -radius * 1.06), textStyle);
    _drawText(canvas, 'LONG', center + Offset(radius * 0.92, -radius * 0.35), textStyle);
  }

  void _drawText(Canvas canvas, String text, Offset pos, TextStyle style) {
    final tp = TextPainter(
      text: TextSpan(text: text, style: style),
      textDirection: TextDirection.ltr,
      textAlign: TextAlign.center,
    )..layout();
    canvas.save();
    canvas.translate(pos.dx - tp.width / 2, pos.dy - tp.height / 2);
    tp.paint(canvas, Offset.zero);
    canvas.restore();
  }

  @override
  bool shouldRepaint(covariant _HalfGaugePainter oldDelegate) {
    return oldDelegate.v != v || oldDelegate.glow != glow || oldDelegate.longPct != longPct || oldDelegate.shortPct != shortPct;
  }
}
