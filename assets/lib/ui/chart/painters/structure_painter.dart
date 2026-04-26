import 'package:flutter/material.dart';
import '../chart_transform.dart';
import '../../../engine/models/struct_event.dart';

/// BOS/MSB 마커 — transform만 사용
class StructurePainter extends CustomPainter {
  final ChartTransform transform;
  final List<StructEvent> events;

  StructurePainter({required this.transform, required this.events});

  @override
  void paint(Canvas canvas, Size size) {
    if (events.isEmpty) return;
    canvas.save();
    canvas.clipRect(transform.plotRect);
    for (final e in events) {
      final x = transform.timeToX(e.t);
      final y = transform.priceToY(e.price);
      final color = _colorFor(e.type);
      canvas.drawCircle(Offset(x, y), 5, Paint()..color = color);
    }
    canvas.restore();
  }

  Color _colorFor(StructEventType type) {
    return switch (type) {
      StructEventType.BOS_UP => Colors.green,
      StructEventType.BOS_DN => Colors.red,
      StructEventType.MSB_UP => Colors.teal,
      StructEventType.MSB_DN => Colors.orange,
      StructEventType.EQH => Colors.red.shade700,
      StructEventType.EQL => Colors.green.shade700,
    };
  }

  @override
  bool shouldRepaint(covariant CustomPainter old) => true;
}
