
import 'package:flutter/material.dart';
import '../../core/models/zone_box.dart';

class ZoneBoxPainter extends CustomPainter {
  final List<ZoneBox> zones;
  ZoneBoxPainter(this.zones);

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()..style = PaintingStyle.fill;
    for (final z in zones) {
      paint.color = Colors.blue.withOpacity(0.15);
      final rect = Rect.fromLTWH(
        0,
        size.height * 0.3,
        size.width,
        size.height * 0.05,
      );
      canvas.drawRect(rect, paint);
    }
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => true;
}
