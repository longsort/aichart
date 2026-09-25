
import 'package:flutter/foundation.dart';

class CandleCloseInfo {
  final String tfLabel;
  final DateTime nextClose;
  final Duration remaining;
  final String verdict; // 좋음/나쁨/중립
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
  /// 로컬 시간 기준(사용자 PC/폰 시간)
  static DateTime _now() => DateTime.now();

  static DateTime nextCloseFor(String tf) {
    final now = _now();
    final t = tf.toLowerCase();
    final isMonth = tf == '1M' || tf.toUpperCase() == '1M';

    // 1달(월봉): 1M만 해당, 1m(분봉)과 구분
    if (isMonth) {
      final y = now.month == 12 ? now.year + 1 : now.year;
      final m = now.month == 12 ? 1 : now.month + 1;
      return DateTime(y, m, 1);
    }

    // 1분/5분/15분/1시간 마감(분 단위 정렬)
    if (t == '1m') {
      var next = DateTime(now.year, now.month, now.day, now.hour, now.minute).add(const Duration(minutes: 1));
      if (!next.isAfter(now)) next = next.add(const Duration(minutes: 1));
      return next;
    }
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
      // 다음 월요일 00:00
      final weekday = now.weekday; // 1=Mon
      final daysToAdd = (8 - weekday) % 7;
      var next = DateTime(now.year, now.month, now.day).add(Duration(days: daysToAdd == 0 ? 7 : daysToAdd));
      return next;
    }

    if (t == '1y' || t == '1yr' || t == '1year') {
      // 다음 해 1월 1일 00:00
      return DateTime(now.year + 1, 1, 1);
    }

    // 기타 TF는 1시간 단위로 근사
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

  /// “마감자리 좋음/나쁨/중립” 초보판정 (간단 규칙)
  /// - 좋음: 현재가가 VWAP 위 + 점수/신뢰 양호
  /// - 나쁨: 현재가가 VWAP 아래 + 위험 높음
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

    String verdict = '중립';
    String reason = '마감 확인 대기';

    final above = price >= vwap;
    if (above && score >= 55 && confidence >= 50 && risk <= 60) {
      verdict = '좋음';
      reason = '평균선 위 유지 + 점수/신뢰 양호';
    } else if (!above && risk >= 65) {
      verdict = '나쁨';
      reason = '평균선 아래 + 위험 높음';
    } else if (above && risk >= 70) {
      verdict = '중립';
      reason = '평균선 위지만 위험 높음(함정 주의)';
    } else if (!above && confidence <= 35) {
      verdict = '나쁨';
      reason = '평균선 아래 + 신뢰 낮음';
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
