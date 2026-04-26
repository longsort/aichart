
import 'dart:math';
import 'package:flutter/material.dart';
import 'state_engine.dart';

class SoftGauge extends StatelessWidget {
  final double value; // 0..1
  final double pulse; // 0..1
  final MarketState state;
  const SoftGauge({super.key, required this.value, required this.pulse, required this.state});

  @override
  Widget build(BuildContext context) {
    return SizedBox(width: 260, height: 260, child: CustomPaint(painter: _Painter(value: value, pulse: pulse, state: state)));
  }
}

class _Painter extends CustomPainter {
  final double value;
  final double pulse;
  final MarketState state;
  _Painter({required this.value, required this.pulse, required this.state});

  @override
  void paint(Canvas canvas, Size size) {
    final c = size.center(Offset.zero);
    final r = size.width / 2;

    final track = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 14
      ..strokeCap = StrokeCap.round
      ..color = Colors.white.withOpacity(0.10);
    canvas.drawArc(Rect.fromCircle(center: c, radius: r * 0.78), pi, pi, false, track);

    final colors = _colorsFor(state);
    final paint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 14
      ..strokeCap = StrokeCap.round
      ..shader = SweepGradient(
        colors: colors,
        transform: GradientRotation(pulse * 0.35),
      ).createShader(Rect.fromCircle(center: c, radius: r));

    canvas.drawArc(Rect.fromCircle(center: c, radius: r * 0.78), pi, pi * value.clamp(0.05, 1.0), false, paint);

    final ang = pi + pi * value.clamp(0.0, 1.0);
    final needle = Paint()
      ..strokeWidth = 6
      ..strokeCap = StrokeCap.round
      ..color = Colors.white.withOpacity(0.75);
    canvas.drawLine(c, c + Offset(cos(ang), sin(ang)) * (r * 0.55), needle);
    canvas.drawCircle(c, 10, Paint()..color = Colors.white.withOpacity(0.35));
  }

  List<Color> _colorsFor(MarketState s) {
    switch (s) {
      case MarketState.energy: return const [Color(0xFF3FD6C6), Color(0xFF3FD6C6), Color(0xFFD6C36F)];
      case MarketState.uncertain: return const [Color(0xFFD6C36F), Color(0xFFD6C36F), Color(0xFFB35A5A)];
      case MarketState.danger: return const [Color(0xFFB35A5A), Color(0xFFB35A5A), Color(0xFFD6C36F)];
      default: return const [Color(0xFF6BA8FF), Color(0xFF3FD6C6), Color(0xFFD6C36F)];
    }
  }

  @override
  bool shouldRepaint(covariant _Painter oldDelegate) => true;
}
