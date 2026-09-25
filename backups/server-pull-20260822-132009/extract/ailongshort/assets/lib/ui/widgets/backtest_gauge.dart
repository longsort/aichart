import 'dart:math' as math;
import 'package:flutter/material.dart';

/// 백테스트 재현용 반원 게이지 + 바늘
class BacktestHalfGauge extends StatelessWidget {
  final double longPct; // 0..1
  final double shortPct; // 0..1
  final double needleBias; // -1..+1

  const BacktestHalfGauge({
    super.key,
    required this.longPct,
    required this.shortPct,
    required this.needleBias,
  });

  @override
  Widget build(BuildContext context) {
    return CustomPaint(
      painter: _BacktestHalfGaugePainter(
        longPct: longPct,
        shortPct: shortPct,
        needleBias: needleBias,
      ),
      child: const SizedBox.expand(),
    );
  }
}

class _BacktestHalfGaugePainter extends CustomPainter {
  final double longPct;
  final double shortPct;
  final double needleBias;

  _BacktestHalfGaugePainter({
    required this.longPct,
    required this.shortPct,
    required this.needleBias,
  });

  @override
  void paint(Canvas c, Size s) {
    final w = s.width;
    final h = s.height;
    final cx = w / 2;
    final cy = h * 0.95;
    final r = math.min(w * 0.46, h * 0.95);

    final rect = Rect.fromCircle(center: Offset(cx, cy), radius: r);

    // Track
    final track = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = r * 0.12
      ..strokeCap = StrokeCap.round
      ..color = Colors.white.withOpacity(0.08);

    // Long arc (left→right over top)
    final pLong = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = r * 0.12
      ..strokeCap = StrokeCap.round
      ..shader = LinearGradient(
        begin: Alignment.centerLeft,
        end: Alignment.centerRight,
        colors: [
          const Color(0xFF00FF7A).withOpacity(0.55),
          const Color(0xFF00FF7A).withOpacity(0.95),
        ],
      ).createShader(rect);

    // Short arc
    final pShort = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = r * 0.12
      ..strokeCap = StrokeCap.round
      ..shader = LinearGradient(
        begin: Alignment.centerLeft,
        end: Alignment.centerRight,
        colors: [
          const Color(0xFFFF2D55).withOpacity(0.95),
          const Color(0xFFFF2D55).withOpacity(0.55),
        ],
      ).createShader(rect);

    // Half circle angles: start at PI, sweep to 0 (clockwise negative sweep is okay)
    const start = math.pi;
    const totalSweep = math.pi;

    // draw track
    c.drawArc(rect, start, -totalSweep, false, track);

    // proportion along the half arc from left to right
    final lp = longPct.clamp(0.0, 1.0);
    final sp = shortPct.clamp(0.0, 1.0);

    // long part from left
    c.drawArc(rect, start, -totalSweep * lp, false, pLong);
    // short part from right (draw from end backwards)
    c.drawArc(rect, 0, -totalSweep * sp, false, pShort);

    // Needle
    final b = needleBias.clamp(-1.0, 1.0);
    // map -1..+1 to left..right over half circle: angle PI (left) to 0 (right)
    final ang = (math.pi / 2) - (b * (math.pi / 2)); // b=+1 => 0, b=-1 => PI
    final needleLen = r * 0.86;

    final p0 = Offset(cx, cy);
    final p1 = Offset(cx + needleLen * math.cos(ang), cy - needleLen * math.sin(ang));

    final needle = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = r * 0.03
      ..strokeCap = StrokeCap.round
      ..color = Colors.white.withOpacity(0.92);

    // glow needle
    final glow = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = r * 0.07
      ..strokeCap = StrokeCap.round
      ..color = (b >= 0 ? const Color(0xFF00FF7A) : const Color(0xFFFF2D55)).withOpacity(0.20);

    c.drawLine(p0, p1, glow);
    c.drawLine(p0, p1, needle);

    // hub
    final hub = Paint()..color = Colors.white.withOpacity(0.85);
    c.drawCircle(p0, r * 0.035, hub);
    c.drawCircle(p0, r * 0.06, Paint()..color = Colors.black.withOpacity(0.35));
  }

  @override
  bool shouldRepaint(covariant _BacktestHalfGaugePainter old) {
    return old.longPct != longPct || old.shortPct != shortPct || old.needleBias != needleBias;
  }
}
