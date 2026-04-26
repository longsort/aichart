
import 'package:flutter/material.dart';

/// BASIC TRAINER TRENDLINES
/// - ?ìŠ¹: ?Œë‘(ì§€ì§€), ?Œë‘ ì±„ë„
/// - ?˜ë½: ë¹¨ê°•(?€??, ë¹¨ê°• ì±„ë„
/// ?¤ë¥¸ ?¨í„´/ì±„ë„ê³?ë¬´ê??˜ê²Œ ??ƒ ê·¸ë ¤ì§?class TrainerTrendlineOverlay extends CustomPainter {
  final List<Offset> candles; // (index, price) normalized externally
  final bool isUp;

  TrainerTrendlineOverlay({required this.candles, required this.isUp});

  @override
  void paint(Canvas canvas, Size size) {
    if (candles.length < 2) return;

    final paintMain = Paint()
      ..color = isUp ? Colors.blueAccent : Colors.redAccent
      ..strokeWidth = 2
      ..style = PaintingStyle.stroke;

    final paintChannel = Paint()
      ..color = (isUp ? Colors.blueAccent : Colors.redAccent).withOpacity(0.35)
      ..strokeWidth = 2
      ..style = PaintingStyle.stroke;

    // simple linear regression on first/last
    final p1 = candles.first;
    final p2 = candles.last;

    // main line
    canvas.drawLine(p1, p2, paintMain);

    // parallel channel (fixed offset)
    const channelOffset = 20.0;
    canvas.drawLine(
      Offset(p1.dx, p1.dy - channelOffset),
      Offset(p2.dx, p2.dy - channelOffset),
      paintChannel,
    );
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => true;
}
