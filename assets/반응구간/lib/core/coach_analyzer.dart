import '../engine/central/decision_logger.dart';

class CoachAnalyzer {
  CoachAnalyzer._();
  static final CoachAnalyzer I = CoachAnalyzer._();

  /// 초보용 요약 생성
  String buildSummary(List<DecisionLogEntry> logs) {
    if (logs.isEmpty) return '기록이 아직 없어요.\n신호가 쌓이면 “실수 패턴”을 자동으로 잡아줄게요.';

    final wins = logs.where((e) => e.result == 'WIN').length;
    final losses = logs.where((e) => e.result == 'LOSS').length;
    final total = wins + losses;
    final winRate = total == 0 ? 0.0 : wins / total;

    // 방향별
    final long = logs.where((e) => e.decision.contains('롱') && (e.result == 'WIN' || e.result == 'LOSS')).toList();
    final short = logs.where((e) => e.decision.contains('숏') && (e.result == 'WIN' || e.result == 'LOSS')).toList();
    double wr(List<DecisionLogEntry> xs) {
      final w = xs.where((e) => e.result == 'WIN').length;
      final l = xs.where((e) => e.result == 'LOSS').length;
      final t = w + l;
      return t == 0 ? 0.0 : w / t;
    }

    // 신뢰/합의 구간별
    final low = logs.where((e) => (e.confidence < 0.60 || e.consensus < 0.50) && (e.result == 'WIN' || e.result == 'LOSS')).toList();
    final high = logs.where((e) => (e.confidence >= 0.60 && e.consensus >= 0.50) && (e.result == 'WIN' || e.result == 'LOSS')).toList();

    // 시간대(대충) - ts의 hour로 0-5/6-11/12-17/18-23
    int bucket(int h) {
      if (h <= 5) return 0;
      if (h <= 11) return 1;
      if (h <= 17) return 2;
      return 3;
    }
    const labels = ['새벽(0-5)', '오전(6-11)', '오후(12-17)', '저녁(18-23)'];
    final by = List.generate(4, (_) => <DecisionLogEntry>[]);
    for (final e in logs) {
      if (e.result != 'WIN' && e.result != 'LOSS') continue;
      by[bucket(e.ts.hour)].add(e);
    }
    int bestIdx = 0;
    double bestWr = -1;
    for (int i=0;i<4;i++){
      final r = wr(by[i]);
      if (by[i].length >= 3 && r > bestWr) { bestWr = r; bestIdx = i; }
    }

    // 최근 연속패
    int streakLoss = 0;
    for (final e in logs.reversed) {
      if (e.result == 'LOSS') streakLoss++;
      else if (e.result == 'WIN') break;
    }

    final tips = <String>[];
    if (total >= 5) {
      if (wr(low) + 0.10 < wr(high)) {
        tips.add('합의/신뢰가 낮을 때 들어가면 성능이 떨어져요 → “보수/초보” 모드 추천');
      }
      if (long.isNotEmpty && short.isNotEmpty) {
        final lwr = wr(long);
        final swr = wr(short);
        if (lwr + 0.12 < swr) tips.add('롱에서 더 자주 실패해요 → 롱 기준을 더 빡세게');
        if (swr + 0.12 < lwr) tips.add('숏에서 더 자주 실패해요 → 숏 기준을 더 빡세게');
      }
      if (bestWr >= 0.0) {
        tips.add('잘 되는 시간대: ${labels[bestIdx]} (최근 기록 기준)');
      }
    }
    if (streakLoss >= 2) tips.add('연속 패배 중이에요 → “20분 쉬기” 또는 초보 모드로 낮추기');

    if (tips.isEmpty) tips.add('지금은 기록이 적어서 확실한 패턴이 없어요. 표본이 쌓이면 더 정확해져요.');

    final s1 = '승률 ${(winRate*100).toStringAsFixed(1)}% (승 $wins / 패 $losses)';
    final s2 = '롱 ${(wr(long)*100).toStringAsFixed(1)}% • 숏 ${(wr(short)*100).toStringAsFixed(1)}%';
    final s3 = '기준 통과(신뢰≥60 & 합의≥50) ${(wr(high)*100).toStringAsFixed(1)}% • 미달 ${(wr(low)*100).toStringAsFixed(1)}%';
    return [
      'AI 코치 요약',
      s1,
      s2,
      s3,
      '',
      '오늘의 조언',
      for (final t in tips.take(5)) '• $t',
    ].join('\n');
  }
}
