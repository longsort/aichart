/// KST(Asia/Seoul, UTC+9) ê¸°ì??¼ë¡œ ?€?„í”„?ˆì„ ë§ˆê° ?œê°„??ê³„ì‚°?œë‹¤.
///
/// - 15m: :00/:15/:30/:45
/// - 1h : ë§¤ì‹œ ?•ê°
/// - 4h : 4?œê°„ ?¨ìœ„ ?•ê°
/// - 1D : KST 09:00 (UTC 00:00)
/// - 1W : ?”ìš”??KST 09:00
/// - 1M : ë§¤ì›” 1??KST 09:00
/// - 1Y : 1??1??KST 09:00
class KstCloseUtil {
  static const Duration _kst = Duration(hours: 9);

  static DateTime nowKst() => DateTime.now().toUtc().add(_kst);

  /// ?¤ìŒ ë§ˆê° ?œê°(KST)??ë°˜í™˜
  static DateTime nextCloseKst(String tf) {
    final n = nowKst();
    final t = tf.trim().toLowerCase();

    if (t == '15m' || t == 'm15') {
      final minuteBucket = (n.minute ~/ 15) * 15;
      final nextMinute = minuteBucket + 15;
      var base = DateTime(n.year, n.month, n.day, n.hour, minuteBucket);
      base = base.add(Duration(minutes: nextMinute - minuteBucket));
      return _carryDay(base);
    }

    if (t == '1h' || t == 'h1') {
      final base = DateTime(n.year, n.month, n.day, n.hour);
      return _carryDay(base.add(const Duration(hours: 1)));
    }

    if (t == '4h' || t == 'h4') {
      final bucket = (n.hour ~/ 4) * 4;
      final base = DateTime(n.year, n.month, n.day, bucket);
      return _carryDay(base.add(const Duration(hours: 4)));
    }

    if (t == '1d' || t == 'd1' || t == 'day') {
      // KST 09:00
      final today = DateTime(n.year, n.month, n.day, 9);
      if (n.isBefore(today)) return today;
      return today.add(const Duration(days: 1));
    }

    if (t == '1w' || t == 'w1' || t == 'week') {
      // ?¤ìŒ ?”ìš”??09:00 (?¤ëŠ˜???”ìš”?¼ì´ê³?09:00 ?„ì´ë©??¤ëŠ˜)
      final today0900 = DateTime(n.year, n.month, n.day, 9);
      final weekday = n.weekday; // Mon=1
      final daysToMon = (8 - weekday) % 7;
      if (weekday == 1 && n.isBefore(today0900)) return today0900;
      return DateTime(n.year, n.month, n.day, 9).add(Duration(days: daysToMon == 0 ? 7 : daysToMon));
    }

    if (t == '1m' || t == 'mo1' || t == 'month') {
      final thisMonth = DateTime(n.year, n.month, 1, 9);
      if (n.isBefore(thisMonth)) return thisMonth;
      final nextMonth = (n.month == 12) ? DateTime(n.year + 1, 1, 1, 9) : DateTime(n.year, n.month + 1, 1, 9);
      return nextMonth;
    }

    if (t == '1y' || t == 'y1' || t == 'year') {
      final thisYear = DateTime(n.year, 1, 1, 9);
      if (n.isBefore(thisYear)) return thisYear;
      return DateTime(n.year + 1, 1, 1, 9);
    }

    // fallback: 1h
    final base = DateTime(n.year, n.month, n.day, n.hour);
    return _carryDay(base.add(const Duration(hours: 1)));
  }

  static String formatCountdown(Duration d) {
    final s = d.inSeconds;
    if (s <= 0) return '0:00';
    final h = s ~/ 3600;
    final m = (s % 3600) ~/ 60;
    final ss = s % 60;
    if (h > 0) return '${h}:${m.toString().padLeft(2, '0')}:${ss.toString().padLeft(2, '0')}';
    return '${m}:${ss.toString().padLeft(2, '0')}';
  }

  static DateTime _carryDay(DateTime x) {
    // DateTime constructor auto-carries, but keep for clarity
    return x;
  }
}
