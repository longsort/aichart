import 'dart:ui';
import 'package:flutter/widgets.dart';
import '../ai/label_resolver.dart';

/// Utility to compute rect for a widget-sized label.
Rect labelRect(Offset topLeft, Size size) {
  return Rect.fromLTWH(topLeft.dx, topLeft.dy, size.width, size.height);
}

/// Simple wrapper to apply resolver results.
class LabelPlacement {
  final Offset pos;
  final bool hidden;

  const LabelPlacement({required this.pos, required this.hidden});

  static List<LabelPlacement> fromResolved(List<LabelPlaced> placed) {
    return placed
        .map((p) => LabelPlacement(pos: Offset(p.rect.left, p.rect.top), hidden: p.hidden))
        .toList();
  }
}