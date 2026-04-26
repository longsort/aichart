
import 'package:flutter/foundation.dart';

class CandleCloseInfo {
  final String tfLabel;
  final DateTime nextClose;
  final Duration remaining;
  final String verdict; // ì¢‹ìŒ/?˜ì¨/ì¤‘ë¦½
  final String reason;
  const CandleCloseInfo({
    required this.tfLabel,
    required this.nextClose,
    required this.remaining,
    required this.verdict,
    required this.reason,
  });
}

class CandleCloseUtil {
  /// ë¡œì»¬ ?œê°„ ê¸°ì?(?¬ìš©??PC/???œê°„)
  static DateTime _now() => DateTime.now();

  static DateTime nextCloseFor(String tf) {
    final now = _now();
    final t = tf.toLowerCase();

    // 5ë¶?15ë¶?1?œê°„ ë§ˆê°(ë¶??¨ìœ„ ?•ë ¬)
    if (t == '5m') {
      final minute = now.minute;
      final base = (minute ~/ 5) * 5;
      var next = DateTime(now.year, now.month, now.day, now.hour, base).add(const Duration(minutes: 5));
      if (!next.isAfter(now)) next = next.add(const Duration(minutes: 5));
      return next;
    }

    if (t == '15m') {
      final minute = now.minute;
      final base = (minute ~/ 15) * 15;
      var next = DateTime(now.year, now.month, now.day, now.hour, base).add(const Duration(minutes: 15));
      if (!next.isAfter(now)) next = next.add(const Duration(minutes: 15));
      return next;
    }

    if (t == '1h') {
      var next = DateTime(now.year, now.month, now.day, now.hour).add(const Duration(hours: 1));
      if (!next.isAfter(now)) next = next.add(const Duration(hours: 1));
      return next;
    }

    if (t == '4h' || t == '4H'.toLowerCase()) {
      final hour = now.hour;
      final base = (hour ~/ 4) * 4;
      var next = DateTime(now.year, now.month, now.day, base).add(const Duration(hours: 4));
      if (!next.isAfter(now)) next = next.add(const Duration(hours: 4));
      return next;
    }

    if (t == '1d' || t == '1D'.toLowerCase()) {
      var next = DateTime(now.year, now.month, now.day).add(const Duration(days: 1));
      return next;
    }

    if (t == '1w' || t == '1W'.toLowerCase()) {
      // ?¤ìŒ ?”ìš”??00:00
      final weekday = now.weekday; // 1=Mon
      final daysToAdd = (8 - weekday) % 7;
      var next = DateTime(now.year, now.month, now.day).add(Duration(days: daysToAdd == 0 ? 7 : daysToAdd));
      return next;
    }

    if (t == '1m' || t == '1M'.toLowerCase()) {
      // ?¤ìŒ ??1??00:00
      final y = now.month == 12 ? now.year + 1 : now.year;
      final m = now.month == 12 ? 1 : now.month + 1;
      return DateTime(y, m, 1);
    }

    if (t == '1y' || t == '1yr' || t == '1year') {
      // ?¤ìŒ ??1??1??00:00
      return DateTime(now.year + 1, 1, 1);
    }

    // ê¸°í? TF??1?œê°„ ?¨ìœ„ë¡?ê·¼ì‚¬
    var next = DateTime(now.year, now.month, now.day, now.hour).add(const Duration(hours: 1));
    if (!next.isAfter(now)) next = next.add(const Duration(hours: 1));
    return next;
  }

  static String fmtRemain(Duration d) {
    final s = d.inSeconds;
    final h = s ~/ 3600;
    final m = (s % 3600) ~/ 60;
    final sec = s % 60;
    if (h > 0) return '${h}h ${m}m';
    if (m > 0) return '${m}m ${sec}s';
    return '${sec}s';
  }

  /// ?œë§ˆê°ìë¦?ì¢‹ìŒ/?˜ì¨/ì¤‘ë¦½??ì´ˆë³´?ì • (ê°„ë‹¨ ê·œì¹™)
  /// - ì¢‹ìŒ: ?„ì¬ê°€ê°€ VWAP ??+ ?ìˆ˜/? ë¢° ?‘í˜¸
  /// - ?˜ì¨: ?„ì¬ê°€ê°€ VWAP ?„ë˜ + ?„í—˜ ?’ìŒ
  static CandleCloseInfo evaluate({
    required String tfLabel,
    required double price,
    required double vwap,
    required int score,
    required int confidence,
    required int risk,
  }) {
    final next = nextCloseFor(tfLabel);
    final rem = next.difference(_now());

    String verdict = 'ì¤‘ë¦½';
    String reason = 'ë§ˆê° ?•ì¸ ?€ê¸?;

    final above = price >= vwap;
    if (above && score >= 55 && confidence >= 50 && risk <= 60) {
      verdict = 'ì¢‹ìŒ';
      reason = '?‰ê· ????? ì? + ?ìˆ˜/? ë¢° ?‘í˜¸';
    } else if (!above && risk >= 65) {
      verdict = '?˜ì¨';
      reason = '?‰ê· ???„ë˜ + ?„í—˜ ?’ìŒ';
    } else if (above && risk >= 70) {
      verdict = 'ì¤‘ë¦½';
      reason = '?‰ê· ???„ì?ë§??„í—˜ ?’ìŒ(?¨ì • ì£¼ì˜)';
    } else if (!above && confidence <= 35) {
      verdict = '?˜ì¨';
      reason = '?‰ê· ???„ë˜ + ? ë¢° ??Œ';
    }

    return CandleCloseInfo(
      tfLabel: tfLabel,
      nextClose: next,
      remaining: rem.isNegative ? Duration.zero : rem,
      verdict: verdict,
      reason: reason,
    );
  }
}
