import 'package:flutter/material.dart';

class HudTheme {
  static const Color bg0 = Color(0xFF070A12);
  static const Color bg1 = Color(0xFF0B1020);
  static const Color neonCyan = Color(0xFF38F2FF);
  static const Color neonMint = Color(0xFF57FFB0);
  static const Color neonPurple = Color(0xFFB36BFF);
  static const Color neonPink = Color(0xFFFF4FD8);
  static const Color danger = Color(0xFFFF4D4D);

  static ThemeData darkTheme() {
    final base = ThemeData.dark(useMaterial3: true);
    return base.copyWith(
      scaffoldBackgroundColor: bg0,
      colorScheme: base.colorScheme.copyWith(
        surface: bg1,
        primary: neonCyan,
        secondary: neonPurple,
        tertiary: neonMint,
        error: danger,
      ),
      textTheme: base.textTheme.apply(
        bodyColor: Colors.white.withOpacity(0.92),
        displayColor: Colors.white.withOpacity(0.92),
      ),
      dividerColor: Colors.white.withOpacity(0.08),
    );
  }
}
