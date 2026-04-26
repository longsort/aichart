import 'dart:ui';
import 'package:flutter/widgets.dart' show EdgeInsets;

class SmartPlace {
  static Offset clampToRect(
    Offset p,
    Rect bounds, {
    double pad = 6,
    EdgeInsets inset = EdgeInsets.zero,
  }) {
    final b = Rect.fromLTRB(
      bounds.left + inset.left,
      bounds.top + inset.top,
      bounds.right - inset.right,
      bounds.bottom - inset.bottom,
    );
    final x = p.dx.clamp(b.left + pad, b.right - pad);
    final y = p.dy.clamp(b.top + pad, b.bottom - pad);
    return Offset(x.toDouble(), y.toDouble());
  }

  static Offset nearZone(Rect zone, Rect viewport, {double dx = 8, double dy = 8}) {
    var p = Offset(zone.left + dx, zone.top + dy);
    p = clampToRect(p, viewport);
    return p;
  }

  static Offset nearLineEnd(Offset end, Rect viewport, {double dx = 10, double dy = -18}) {
    var p = Offset(end.dx + dx, end.dy + dy);
    p = clampToRect(p, viewport);
    return p;
  }
}