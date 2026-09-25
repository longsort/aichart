import 'dart:math' as math;

/// 매우 가벼운 패턴 유사도 매칭(MVP)
/// - 최근 N캔들의 '수익률 벡터'를 만들고
/// - 과거 구간을 슬라이딩하며 코사인 유사도로 비교
/// - 상위 K개 구간을 반환
class PatternMatch {
  final int startIndex; // 과거 구간 시작 인덱스
  final double similarity; // 0~1
  final double fwdReturn; // 이후 H캔들 수익률(%) 기준
  PatternMatch({required this.startIndex, required this.similarity, required this.fwdReturn});
}

class PatternMatcher {
  static List<PatternMatch> topMatches({
    required List<double> closes,
    int recentLen = 20,
    int horizon = 20,
    int topK = 3,
    int minGap = 5,
  }) {
    if (closes.length < recentLen + horizon + 5) return const [];
    final lastStart = closes.length - recentLen;
    final recent = _returns(closes.sublist(lastStart - 1, closes.length)); // length recentLen
    final recentNorm = _norm(recent);
    if (recentNorm == 0) return const [];

    final endLimit = closes.length - recentLen - horizon - 1;
    final matches = <PatternMatch>[];

    for (int s = 1; s <= endLimit; s++) {
      // recent window overlap 방지: 현재 구간과 너무 가까운 건 제외
      if ((closes.length - s) < (recentLen + horizon + minGap)) continue;

      final window = _returns(closes.sublist(s - 1, s + recentLen));
      final sim = _cosine(recent, window, recentNorm);
      if (sim <= 0) continue;

      final entry = closes[s + recentLen - 1];
      final exit = closes[s + recentLen - 1 + horizon];
      final fwd = entry == 0 ? 0.0 : ((exit - entry) / entry) * 100.0;
      matches.add(PatternMatch(startIndex: s, similarity: sim, fwdReturn: fwd));
    }

    matches.sort((a, b) => b.similarity.compareTo(a.similarity));
    // 너무 비슷한 위치가 연속으로 잡히는 걸 방지(간격 필터)
    final out = <PatternMatch>[];
    for (final m in matches) {
      if (out.length >= topK) break;
      final near = out.any((x) => (x.startIndex - m.startIndex).abs() < recentLen);
      if (near) continue;
      out.add(m);
    }
    return out;
  }

  static double winrate({
    required List<PatternMatch> matches,
    required String dir, // LONG/SHORT
    double thresholdPct = 0.2, // 0.2% 이상이면 승
  }) {
    if (matches.isEmpty) return 0;
    int win = 0;
    for (final m in matches) {
      if (dir == 'LONG') {
        if (m.fwdReturn >= thresholdPct) win++;
      } else if (dir == 'SHORT') {
        if (m.fwdReturn <= -thresholdPct) win++;
      }
    }
    return (win / matches.length) * 100.0;
  }

  static List<double> _returns(List<double> closes) {
    // closes length = recentLen+1
    final r = <double>[];
    for (int i = 1; i < closes.length; i++) {
      final prev = closes[i - 1];
      final cur = closes[i];
      if (prev == 0) {
        r.add(0);
      } else {
        r.add((cur - prev) / prev);
      }
    }
    return r;
  }

  static double _dot(List<double> a, List<double> b) {
    double s = 0;
    for (int i = 0; i < a.length; i++) {
      s += a[i] * b[i];
    }
    return s;
  }

  static double _norm(List<double> a) {
    return math.sqrt(_dot(a, a));
  }

  static double _cosine(List<double> a, List<double> b, double aNorm) {
    final bNorm = _norm(b);
    if (aNorm == 0 || bNorm == 0) return 0;
    final d = _dot(a, b);
    final v = d / (aNorm * bNorm);
    if (v.isNaN || v.isInfinite) return 0;
    return v.clamp(0.0, 1.0);
  }
}
