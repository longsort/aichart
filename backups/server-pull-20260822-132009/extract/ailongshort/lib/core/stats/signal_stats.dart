
class SignalStats {
  final String key;
  int win = 0;
  int lose = 0;

  SignalStats(this.key);

  double get winRate {
    final t = win + lose;
    if (t == 0) return 0;
    return win / t;
  }

  void record(bool isWin) {
    if (isWin) {
      win++;
    } else {
      lose++;
    }
  }
}
