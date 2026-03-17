import 'package:flutter/material.dart';

class AppColors {
  // 기본 배경
  static const Color background = Color(0xFF0E0E11);
  static const Color card = Color(0xFF16161D);

  // 메인 텍스트
  static const Color textPrimary = Color(0xFFEAEAEA);
  static const Color textSecondary = Color(0xFFB0B3B8);

  // 👉 이번 에러 원인: 이게 없어서 터졌음
  static const Color textMuted = Color(0xFF9AA0A6);

  // 상태 컬러
  static const Color green = Color(0xFF3DDC84);
  static const Color red = Color(0xFFE5533D);
  static const Color yellow = Color(0xFFF5C542);

  // 라인/보더
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
