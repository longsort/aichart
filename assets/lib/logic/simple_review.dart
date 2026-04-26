class SimpleReview {
  /// outcome: WIN / LOSS / BE
  static String oneLine({
    required String outcome,
    required String symbol,
    required String tf,
    required String side,
    required int prob,
  }) {
    final o = outcome.toUpperCase();
    if (o == 'WIN') return '✅ $symbol $tf $side WIN · 확률 $prob% → 계획대로.';
    if (o == 'LOSS') return '❌ $symbol $tf $side LOSS · 확률 $prob% → 무효/손절 준수 점검.';
    if (o == 'BE') return '➖ $symbol $tf $side BE · 확률 $prob% → 애매, 다음엔 증거 더 모으기.';
    return '📝 $symbol $tf $side $o · 확률 $prob%';
  }
}
