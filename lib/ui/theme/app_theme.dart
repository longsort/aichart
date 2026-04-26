import 'package:flutter/material.dart';

class AppColors {
  // Í∏∞Î≥∏ Î∞∞Í≤Ω
  static const Color background = Color(0xFF0E0E11);
  static const Color card = Color(0xFF16161D);

  // Î©îÏù∏ ?çÏä§??
  static const Color textPrimary = Color(0xFFEAEAEA);
  static const Color textSecondary = Color(0xFFB0B3B8);

  // ?ëâ ?¥Î≤à ?êÎü¨ ?êÏù∏: ?¥Í≤å ?ÜÏñ¥???∞Ï°å??
  static const Color textMuted = Color(0xFF9AA0A6);

  // ?ÅÌÉú Ïª¨Îü¨
  static const Color green = Color(0xFF3DDC84);
  static const Color red = Color(0xFFE5533D);
  static const Color yellow = Color(0xFFF5C542);

  // ?ºÏù∏/Î≥¥Îçî
  static const Color divider = Color(0xFF2A2A35);
}

ThemeData buildAppTheme() {
  return ThemeData(
    brightness: Brightness.dark,
    scaffoldBackgroundColor: AppColors.background,
    cardColor: AppColors.card,
    dividerColor: AppColors.divider,
    textTheme: const TextTheme(
      bodyLarge: TextStyle(color: AppColors.textPrimary),
      bodyMedium: TextStyle(color: AppColors.textPrimary),
      bodySmall: TextStyle(color: AppColors.textSecondary),
      labelSmall: TextStyle(color: AppColors.textMuted),
    ),
  );
}
