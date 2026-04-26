class MtfConsensus {
  // Higher TF wins on conflict.
  static int weight(String tf) {
    final t = tf.toLowerCase();
    if (t.contains('1d')) return 50;
    if (t.contains('4h')) return 30;
    if (t.contains('1h')) return 20;
    if (t.contains('15m')) return 12;
    if (t.contains('5m')) return 8;
    return 10;
  }

  static String resolve({
    required String dir,
    required String htDir, // higher timeframe direction
    required String tf,
  }) {
    if (htDir.isEmpty) return dir;
    if (dir == htDir) return dir;
    // Conflict: favor higher timeframe unless confidence is extreme (handled elsewhere)
    final w = weight(tf);
    if (w < 20) return htDir; // lower TF must follow HTF
    return htDir;
  }
}
