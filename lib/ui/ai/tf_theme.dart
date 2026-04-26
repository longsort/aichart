import 'package:flutter/material.dart';

class TfTheme {
  final String tf;
  final Color tone;
  final double glowOpacity;
  final int densityLevel;

  const TfTheme({
    required this.tf,
    required this.tone,
    required this.glowOpacity,
    required this.densityLevel,
  });

  static TfTheme of(String tf) {
    final t = tf.toLowerCase();
    if (t == '15m' || t == '15') return const TfTheme(tf: '15m', tone: Color(0xFFFFC857), glowOpacity: 0.14, densityLevel: 5);
    if (t == '1h' || t == '60m' || t == '60') return const TfTheme(tf: '1h', tone: Color(0xFF2BFFB7), glowOpacity: 0.12, densityLevel: 4);
    if (t == '4h' || t == '240m' || t == '240') return const TfTheme(tf: '4h', tone: Color(0xFF00E676), glowOpacity: 0.11, densityLevel: 3);
    if (t == '1d') return const TfTheme(tf: '1D', tone: Color(0xFF2CCBFF), glowOpacity: 0.10, densityLevel: 3);
    if (t == '1w') return const TfTheme(tf: '1W', tone: Color(0xFF5A7CFF), glowOpacity: 0.09, densityLevel: 2);
    if (t == '1m') return const TfTheme(tf: '1M', tone: Color(0xFF8B5CFF), glowOpacity: 0.08, densityLevel: 2);
    if (t == '1y' || t == 'year') return const TfTheme(tf: '1Y', tone: Color(0xFFB455FF), glowOpacity: 0.07, densityLevel: 1);
    return const TfTheme(tf: '15m', tone: Color(0xFFFFC857), glowOpacity: 0.14, densityLevel: 5);
  }
}