import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

class Responsive {
  static bool isMobile(BuildContext context) {
    final s = MediaQuery.of(context).size;
    return s.shortestSide < 600;
  }

  static bool isWindows() => !kIsWeb && defaultTargetPlatform == TargetPlatform.windows;

  static double scale(BuildContext context) {
    final w = MediaQuery.of(context).size.width;
    return (w / 390.0).clamp(0.88, 1.20);
  }

  static double chartSafeBottom(BuildContext context) {
    final bottomInset = MediaQuery.of(context).padding.bottom;
    final mobile = isMobile(context);
    final base = mobile ? 86.0 : 52.0; // decision bar + handle
    return base + bottomInset;
  }
}