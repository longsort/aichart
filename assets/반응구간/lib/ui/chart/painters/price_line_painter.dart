import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import '../chart_transform.dart';
import '../../../engine/models/candle.dart';

/// 가격 선 — transform만 사용, 계산 금지
class PriceLinePainter extends CustomPainter {
  final ChartTransform transform;
  final List<Candle> candles;

  PriceLinePainter({required this.transform, required this.candles});

  @override
  void paint(Canvas canvas, Size size) {
    if (candles.isEmpty) return;
    canvas.save();
    canvas.clipRect(transform.plotRect);
    final path = ui.Path();
    final list = List<Candle>.from(candles)..sort((a, b) => a.t.compareTo(b.t));
    for (var i = 0; i < list.length; i++) {
      final x = transform.timeToX(list[i].t);
      final y = transform.priceToY(list[i].c);
      if (i == 0) path.moveTo(x, y);
      else path.lineTo(x, y);
    }
    canvas.drawPath(path, Paint()..color = Colors.teal..strokeWidth = 2..style = PaintingStyle.stroke);
    canvas.restore();
  }

  @override
  bool shouldRepaint(covariant CustomPainter old) => true;
}
