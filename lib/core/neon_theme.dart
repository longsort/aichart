import 'package:flutter/material.dart';

class NeonTheme {

  // --- v10.6.x UI ?�큰 ?�환 게터 (ultra_home_screen?�서 ?�용) ---
  static const Color _bg = Color(0xFF0A0C10);
  static const Color _card = Color(0xFF111520);
  static const Color _stroke = Color(0xFF2A3450);
  static const Color _textStrong = Color(0xFFE5E7EB);
  static const Color _text = Color(0xFFD1D5DB);
  static const Color _textWeak = Color(0xFF9CA3AF);

  Color get panel => _card;
  Color get line => _stroke;
  Color get shadow => const Color(0x99000000);
  Color get textStrong => _textStrong;
  Color get text => _text;
  Color get textWeak => _textWeak;

  static ThemeData build() {
    const bg = Color(0xFF0A0C10);
    const card = Color(0xFF111520);
    const stroke = Color(0xFF2A3450);
    const accent = Color(0xFF38BDF8); // ?�온 블루
    const accent2 = Color(0xFF22C55E); // ?�온 그린
    const warn = Color(0xFFF59E0B);
    const danger = Color(0xFFEF4444);

    final base = ThemeData.dark(useMaterial3: true);

    return base.copyWith(
      scaffoldBackgroundColor: bg,
      colorScheme: base.colorScheme.copyWith(
        surface: card,
        primary: accent,
        secondary: accent2,
        error: danger,
      ),
      textTheme: base.textTheme.apply(
        fontFamily: 'Roboto',
        bodyColor: Colors.white,
        displayColor: Colors.white,
      ),
      appBarTheme: const AppBarTheme(
        backgroundColor: bg,
        foregroundColor: Colors.white,
        elevation: 0,
        centerTitle: false,
      ),
      cardTheme: CardTheme(
        color: card,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
          side: const BorderSide(color: stroke, width: 1),
        ),
      ),
      dividerColor: stroke,
      chipTheme: base.chipTheme.copyWith(
        backgroundColor: card,
        side: const BorderSide(color: stroke),
        labelStyle: const TextStyle(color: Colors.white),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: accent,
          foregroundColor: Colors.black,
          padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 14),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: Colors.white,
          side: const BorderSide(color: stroke),
          padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 14),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
        ),
      ),
      extensions: const <ThemeExtension<dynamic>>[
        _NeonColors(
          bg: bg,
          card: card,
          stroke: stroke,
          accent: accent,
          accent2: accent2,
          warn: warn,
          danger: danger,
        ),
      ],
    );
  }
}

@immutable
class _NeonColors extends ThemeExtension<_NeonColors> {
  const _NeonColors({
    required this.bg,
    required this.card,
    required this.stroke,
    required this.accent,
    required this.accent2,
    required this.warn,
    required this.danger,
  });

  final Color bg;
  final Color card;
  final Color stroke;
  final Color accent;
  final Color accent2;
  final Color warn;
  final Color danger;

  @override
  _NeonColors copyWith({
    Color? bg,
    Color? card,
    Color? stroke,
    Color? accent,
    Color? accent2,
    Color? warn,
    Color? danger,
  }) {
    return _NeonColors(
      bg: bg ?? this.bg,
      card: card ?? this.card,
      stroke: stroke ?? this.stroke,
      accent: accent ?? this.accent,
      accent2: accent2 ?? this.accent2,
      warn: warn ?? this.warn,
      danger: danger ?? this.danger,
    );
  }

  @override
  _NeonColors lerp(ThemeExtension<_NeonColors>? other, double t) {
    if (other is! _NeonColors) return this;
    return _NeonColors(
      bg: Color.lerp(bg, other.bg, t) ?? bg,
      card: Color.lerp(card, other.card, t) ?? card,
      stroke: Color.lerp(stroke, other.stroke, t) ?? stroke,
      accent: Color.lerp(accent, other.accent, t) ?? accent,
      accent2: Color.lerp(accent2, other.accent2, t) ?? accent2,
      warn: Color.lerp(warn, other.warn, t) ?? warn,
      danger: Color.lerp(danger, other.danger, t) ?? danger,
    );
  }
}
