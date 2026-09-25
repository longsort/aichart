import 'dart:math' as math;
import 'package:flutter/material.dart';

/// 중앙 게이지 (v1)
/// - score(0~100) 기반 ?�형 게이지 + 부?�러???�니메이??/// - confidence/risk ?�시
/// - ?�후 ?�진 �??�력/고래/리스?????�로 ?�게 ?�장 가??class CenterGaugeV1 extends StatelessWidget {
  final int score; // 0~100
  final int confidence; // 0~100
  final int risk; // 0~100
  final double size;

  const CenterGaugeV1({
    super.key,
    required this.score,
    required this.confidence,
    required this.risk,
    this.size = 186,
  });

  Color _mainColor(int v) {
    if (v >= 75) return Colors.cyanAccent;
    if (v >= 55) return Colors.purpleAccent;
    return Colors.orangeAccent;
  }

  String _grade(int v, int risk) {
    if (risk >= 80) return '?�험';
    if (v >= 80) return '강함';
    if (v >= 60) return '?�세';
    if (v >= 45) return '중립';
    return '?�함';
  }

  @override
  Widget build(BuildContext context) {
    final s = score.clamp(0, 100);
    final c = confidence.clamp(0, 100);
    final r = risk.clamp(0, 100);
    final main = _mainColor(s);

    return Center(
      child: TweenAnimationBuilder<double>(
        tween: Tween<double>(begin: 0, end: s.toDouble()),
        duration: const Duration(milliseconds: 420),
        curve: Curves.easeOutCubic,
        builder: (context, animScore, _) {
          return CustomPaint(
            painter: _CenterGaugePainter(
              score: animScore,
              confidence: c.toDouble(),
              risk: r.toDouble(),
              main: main,
            ),
            child: SizedBox(
              width: size,
              height: size,
              child: Padding(
                padding: const EdgeInsets.only(top: 10),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Text(
                      _grade(s, r),
                      style: TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w800,
                        color: main.withOpacity(0.95),
                        letterSpacing: -0.2,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      '${animScore.round()}',
                      style: const TextStyle(
                        fontSize: 44,
                        fontWeight: FontWeight.w900,
                        letterSpacing: -1.2,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        _chip('?�뢰', c, main),
                        const SizedBox(width: 8),
                        _chip('?�험', r, Colors.redAccent),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          );
        },
      ),
    );
  }

  Widget _chip(String label, int v, Color color) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.06),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: Colors.white.withOpacity(0.10)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 8,
            height: 8,
            decoration: BoxDecoration(
              color: color.withOpacity(0.9),
              shape: BoxShape.circle,
            ),
          ),
          const SizedBox(width: 6),
          Text(
            '$label $v%',
            style: const TextStyle(
              fontSize: 12,
              color: Colors.white70,
              fontWeight: FontWeight.w700,
              letterSpacing: -0.1,
            ),
          ),
        ],
      ),
    );
  }
}

class _CenterGaugePainter extends CustomPainter {
  final double score; // 0~100 (animated)
  final double confidence;
  final double risk;
  final Color main;

  _CenterGaugePainter({
    required this.score,
    required this.confidence,
    required this.risk,
    required this.main,
  });

  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height / 2);
    final radius = math.min(size.width, size.height) / 2 - 14;

    // base ring
    final base = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 14
      ..color = Colors.white.withOpacity(0.07);
    canvas.drawCircle(center, radius, base);

    // arc
    final sweep = (score.clamp(0, 100) / 100.0) * 2 * math.pi;
    final glow = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 22
      ..strokeCap = StrokeCap.round
      ..color = main.withOpacity(0.18);
    canvas.drawArc(Rect.fromCircle(center: center, radius: radius), -math.pi / 2, sweep, false, glow);

    final arc = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 12
      ..strokeCap = StrokeCap.round
      ..color = main.withOpacity(0.88);
    canvas.drawArc(Rect.fromCircle(center: center, radius: radius), -math.pi / 2, sweep, false, arc);

    // outer fine ring
    final outer = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1
      ..color = Colors.white.withOpacity(0.16);
    canvas.drawCircle(center, radius + 10, outer);

    // needle (risk accent)
    final needleAngle = (-math.pi / 2) + (risk.clamp(0, 100) / 100.0) * 2 * math.pi;
    final needleLen = radius + 8;
    final needle = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 3
      ..strokeCap = StrokeCap.round
      ..color = (risk >= 70 ? Colors.redAccent : Colors.white70).withOpacity(0.85);

    final p2 = Offset(center.dx + math.cos(needleAngle) * needleLen, center.dy + math.sin(needleAngle) * needleLen);
    canvas.drawLine(center, p2, needle);

    // hub
    final hub = Paint()..color = Colors.black.withOpacity(0.35);
    canvas.drawCircle(center, 8, hub);
    final hub2 = Paint()..color = Colors.white.withOpacity(0.18);
    canvas.drawCircle(center, 9, hub2);
  }

  @override
  bool shouldRepaint(covariant _CenterGaugePainter oldDelegate) {
    return oldDelegate.score != score ||
        oldDelegate.confidence != confidence ||
        oldDelegate.risk != risk ||
        oldDelegate.main != main;
  }
}
