import 'package:shared_preferences/shared_preferences.dart';

/// 초보용: 버튼(WIN/LOSS/BE)으로 오늘 성과를 기록하고 점수로 보여줌
class SessionScore {
  final int wins;
  final int losses;
  final int be;

  const SessionScore({
    required this.wins,
    required this.losses,
    required this.be,
  });

  int get total => wins + losses + be;

  /// 간단 점수: 승률*100 - 손실페널티
  int get score {
    if (total == 0) return 0;
    final winRate = (wins / total) * 100.0;
    final penalty = losses * 7;
    return (winRate - penalty).round().clamp(0, 100);
  }

  double get winRate {
    if (total == 0) return 0;
    return wins / total;
  }
}

class SessionScoreStore {
  static String _k(String suffix) => 'session_score_$suffix';

  static String _todayKey() {
    final now = DateTime.now();
    return '${now.year}-${now.month.toString().padLeft(2, '0')}-${now.day.toString().padLeft(2, '0')}';
  }

  static Future<SessionScore> loadToday() async {
    final sp = await SharedPreferences.getInstance();
    final day = _todayKey();
    final wins = sp.getInt(_k('${day}_w')) ?? 0;
    final losses = sp.getInt(_k('${day}_l')) ?? 0;
    final be = sp.getInt(_k('${day}_b')) ?? 0;
    return SessionScore(wins: wins, losses: losses, be: be);
  }

  static Future<SessionScore> addOutcome(String outcome) async {
    final sp = await SharedPreferences.getInstance();
    final day = _todayKey();
    final wk = _k('${day}_w');
    final lk = _k('${day}_l');
    final bk = _k('${day}_b');

    int w = sp.getInt(wk) ?? 0;
    int l = sp.getInt(lk) ?? 0;
    int b = sp.getInt(bk) ?? 0;

    switch (outcome.toUpperCase()) {
      case 'WIN':
        w++;
        break;
      case 'LOSS':
        l++;
        break;
      default:
        b++;
        break;
    }

    await sp.setInt(wk, w);
    await sp.setInt(lk, l);
    await sp.setInt(bk, b);
    return SessionScore(wins: w, losses: l, be: b);
  }

  static Future<void> resetToday() async {
    final sp = await SharedPreferences.getInstance();
    final day = _todayKey();
    await sp.remove(_k('${day}_w'));
    await sp.remove(_k('${day}_l'));
    await sp.remove(_k('${day}_b'));
  }
}
