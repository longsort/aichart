/// KST(Asia/Seoul, UTC+9) 기준으로 타임프레임 마감 시간을 계산한다.
///
/// - 15m: :00/:15/:30/:45
/// - 1h : 매시 정각
/// - 4h : 4시간 단위 정각
/// - 1D : KST 09:00 (UTC 00:00)
/// - 1W : 월요일 KST 09:00
/// - 1M : 매월 1일 KST 09:00
/// - 1Y : 1월 1일 KST 09:00
class KstCloseUtil {
  static const Duration _kst = Duration(hours: 9);

  static DateTime nowKst() => DateTime.now().toUtc().add(_kst);

  /// 다음 마감 시각(KST)을 반환
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
      // 다음 월요일 09:00 (오늘이 월요일이고 09:00 전이면 오늘)
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
