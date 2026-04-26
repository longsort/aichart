
import 'dart:math' as math;
import 'package:flutter/material.dart';
import '../../core/models/candle.dart';

class CandlePainter extends CustomPainter {
  final List<Candle> candles;
  CandlePainter(this.candles);

  @override
  void paint(Canvas canvas, Size size) {
    if (candles.isEmpty) return;

    // === FIX v3b ===
    // Y-scale MUST use RAW OHLC only
    double minY = candles.first.low;
    double maxY = candles.first.high;

    for (final c in candles) {
      minY = math.min(minY, c.low);
      maxY = math.max(maxY, c.high);
    }

    final pad = (maxY - minY) * 0.05;
    minY -= pad;
    maxY += pad;

    double y(double price) {
      return size.height * (1 - (price - minY) / (maxY - minY));
    }

    final w = size.width / candles.length;

    for (int i = 0; i < candles.length; i++) {
      final c = candles[i];
      final x = i * w + w / 2;

      final wick = Paint()
        ..color = Colors.white.withOpacity(0.4)
        ..strokeWidth = 1;

      canvas.drawLine(Offset(x, y(c.high)), Offset(x, y(c.low)), wick);

      final body = Paint()
        ..color = c.close >= c.open
            ? const Color(0xFF6BE7B6)
            : const Color(0xFFFF6B6B);

      final top = y(math.max(c.open, c.close));
      final bottom = y(math.min(c.open, c.close));

      canvas.drawRect(
        Rect.fromLTWH(i * w + w * 0.2, top, w * 0.6, bottom - top),
        body,
      );
    }
  }

  @override
  bool shouldRepaint(covariant CandlePainter oldDelegate) => true;
}
