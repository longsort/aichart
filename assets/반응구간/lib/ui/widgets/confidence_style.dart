import 'package:flutter/material.dart';

/// Helper to apply confidence to Paint/Color safely.
class ConfidenceStyle {
  /// Adjust alpha by multiplying opacityMul (0.35~1.00)
  static Color withOpacityMul(Color c, double opacityMul) {
    final o = (c.opacity * opacityMul).clamp(0.0, 1.0);
    return c.withOpacity(o);
  }

  /// Adjust stroke width by multiplying strokeMul (0.70~1.40)
  static double stroke(double baseStroke, double strokeMul) {
    return (baseStroke * strokeMul).clamp(0.6, 6.0);
  }
}