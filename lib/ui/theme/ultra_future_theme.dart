import 'package:flutter/material.dart';

class UltraFutureTheme {
  static ThemeData dark() {
    final base = ThemeData.dark(useMaterial3: true);

    return base.copyWith(
      scaffoldBackgroundColor: const Color(0xFF070A12),
      cardColor: const Color(0xFF0B1020),
      colorScheme: base.colorScheme.copyWith(
        primary: const Color(0xFF7CFFCB),
        secondary: const Color(0xFF8FB3FF),
        surface: const Color(0xFF0B1020),
        onSurface: Colors.white,
      ),
      textTheme: base.textTheme.apply(
        bodyColor: Colors.white,
        displayColor: Colors.white,
      ),
    );
  }
}