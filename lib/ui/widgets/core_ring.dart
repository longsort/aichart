import 'dart:math';
import 'package:flutter/material.dart';

class CoreRing extends StatelessWidget {
  final int score; // 0~100
  final int confidence; // 0~100
  final double size;
  const CoreRing({
    super.key,
    required this.score,
    required this.confidence,
    this.size = 96,
  });

  @override
  Widget build(BuildContext context) {
    return CustomPaint(
      painter: _RingPainter(score: score, confidence: confidence),
      child: SizedBox(
        width: size,
        height: size,
        child: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Text('?ìˆ˜', style: TextStyle(fontSize: 11, color: Colors.white70)),
              Text('$score', style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w800)),
              Text('? ë¢° $confidence%', style: const TextStyle(fontSize: 11, color: Colors.white70)),
            ],
          ),
        ),
      ),
    );
  }
}

class _RingPainter extends CustomPainter {
  final int score;
  final int confidence;
  _RingPainter({required this.score, required this.confidence});

  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height / 2);
    final r = min(size.width, size.height) / 2 - 10;

    final base = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 14
      ..color = Colors.white.withOpacity(0.08);

    canvas.drawCircle(center, r, base);

    final sweep = (score.clamp(0, 100) / 100.0) * 2 * pi;

    final glow = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 18
      ..strokeCap = StrokeCap.round
      ..color = (score >= 70 ? Colors.cyanAccent : score >= 50 ? Colors.purpleAccent : Colors.orangeAccent)
          .withOpacity(0.22);

    canvas.drawArc(Rect.fromCircle(center: center, radius: r), -pi / 2, sweep, false, glow);

    final arc = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 12
      ..strokeCap = StrokeCap.round
      ..color = (score >= 70 ? Colors.cyanAccent : score >= 50 ? Colors.purpleAccent : Colors.orangeAccent)
          .withOpacity(0.85);

    canvas.drawArc(Rect.fromCircle(center: center, radius: r), -pi / 2, sweep, false, arc);

    // ?¸ê³½ ?‡ì? ?¼ì¸
    final outer = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1
      ..color = Colors.white.withOpacity(0.14);
    canvas.drawCircle(center, r + 10, outer);
  }

  @override
  bool shouldRepaint(covariant _RingPainter oldDelegate) =>
      oldDelegate.score != score || oldDelegate.confidence != confidence;
}
