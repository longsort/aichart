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

  // ?¸í™˜?? FX ?„ì ¯?¤ì´ accentë¥?ê¸°ë??˜ëŠ” ê²½ìš°ê°€ ?ˆì–´ ì¶”ê?
  Color get accent => good;

  // ?¸í™˜?? ?¼ë? UI ?¨ì¹˜ê°€ textPrimary/textSecondaryë¥?ê¸°ë?
  Color get textPrimary => fg;
  Color get textSecondary => muted;

  // ?¸í™˜?? ?¼ë? ?”ë©´??theme.text ? í°??ê¸°ë?
  Color get text => fg;

  // ?¸í™˜?? ?¼ë? ?”ë©´??panel/line/shadow ? í°??ê¸°ë?
  Color get panel => card;
  Color get line => border;
  Color get shadow => Colors.black;

  // ?¸í™˜?? ê°•í•œ ?ìŠ¤??ì»¬ëŸ¬
  Color get textStrong => Colors.white; // fallback

}
