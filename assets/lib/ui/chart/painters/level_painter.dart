import 'package:flutter/material.dart';
import '../chart_transform.dart';
import '../../../engine/models/level_line.dart';

/// EQH/EQL 수평선 — transform만 사용
class LevelPainter extends CustomPainter {
  final ChartTransform transform;
  final List<LevelLine> lines;

  LevelPainter({required this.transform, required this.lines});

  @override
  void paint(Canvas canvas, Size size) {
    if (lines.isEmpty) return;
    canvas.save();
    canvas.clipRect(transform.plotRect);
    for (final line in lines) {
      final y = transform.priceToY(line.y);
      final paint = Paint()
        ..color = line.type == LevelType.EQH ? Colors.red.withValues(alpha: 0.6) : Colors.green.withValues(alpha: 0.6)
        ..strokeWidth = 1;
      canvas.drawLine(Offset(transform.plotRect.left, y), Offset(transform.plotRect.right, y), paint);
    }
    canvas.restore();
  }

  @override
  bool shouldRepaint(covariant CustomPainter old) => true;
}
