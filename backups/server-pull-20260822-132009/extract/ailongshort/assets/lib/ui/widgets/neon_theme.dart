import 'package:flutter/material.dart';

class NeonTheme {
  final Color bg, card, border, fg, muted, good, bad, warn;
  const NeonTheme({
    required this.bg,
    required this.card,
    required this.border,
    required this.fg,
    required this.muted,
    required this.good,
    required this.bad,
    required this.warn,
  });

  static NeonTheme of(BuildContext context) {
    return const NeonTheme(
      bg: Color(0xFF070A12),
      card: Color(0xFF0C1020),
      border: Color(0xFF2A335A),
      fg: Color(0xFFE9ECFF),
      muted: Color(0xFF98A0C8),
      good: Color(0xFF39FFB6),
      bad: Color(0xFFFF4D6D),
      warn: Color(0xFFFFD166),
    );
  }

  // 호환용: FX 위젯들이 accent를 기대하는 경우가 있어 추가
  Color get accent => good;

  // 호환용: 일부 UI 패치가 textPrimary/textSecondary를 기대
  Color get textPrimary => fg;
  Color get textSecondary => muted;

  // 호환용: 일부 화면이 theme.text 토큰을 기대
  Color get text => fg;

  // 호환용: 일부 화면이 panel/line/shadow 토큰을 기대
  Color get panel => card;
  Color get line => border;
  Color get shadow => Colors.black;

  // 호환용: 강한 텍스트 컬러
  Color get textStrong => Colors.white; // fallback

}
