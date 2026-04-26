import '../engine/central/decision_logger.dart';

class CoachAnalyzer {
  CoachAnalyzer._();
  static final CoachAnalyzer I = CoachAnalyzer._();

  /// ì´ˆë³´???”ì•½ ?ì„±
  String buildSummary(List<DecisionLogEntry> logs) {
    if (logs.isEmpty) return 'ê¸°ë¡???„ì§ ?†ì–´??\n? í˜¸ê°€ ?“ì´ë©??œì‹¤???¨í„´?ì„ ?ë™?¼ë¡œ ?¡ì•„ì¤„ê²Œ??';

    final wins = logs.where((e) => e.result == 'WIN').length;
    final losses = logs.where((e) => e.result == 'LOSS').length;
    final total = wins + losses;
    final winRate = total == 0 ? 0.0 : wins / total;

    // ë°©í–¥ë³?    final long = logs.where((e) => e.decision.contains('ë¡?) && (e.result == 'WIN' || e.result == 'LOSS')).toList();
    final short = logs.where((e) => e.decision.contains('??) && (e.result == 'WIN' || e.result == 'LOSS')).toList();
    double wr(List<DecisionLogEntry> xs) {
      final w = xs.where((e) => e.result == 'WIN').length;
      final l = xs.where((e) => e.result == 'LOSS').length;
      final t = w + l;
      return t == 0 ? 0.0 : w / t;
    }

    // ? ë¢°/?©ì˜ êµ¬ê°„ë³?    final low = logs.where((e) => (e.confidence < 0.60 || e.consensus < 0.50) && (e.result == 'WIN' || e.result == 'LOSS')).toList();
    final high = logs.where((e) => (e.confidence >= 0.60 && e.consensus >= 0.50) && (e.result == 'WIN' || e.result == 'LOSS')).toList();

    // ?œê°„?€(?€ì¶? - ts??hourë¡?0-5/6-11/12-17/18-23
    int bucket(int h) {
      if (h <= 5) return 0;
      if (h <= 11) return 1;
      if (h <= 17) return 2;
      return 3;
    }
    const labels = ['?ˆë²½(0-5)', '?¤ì „(6-11)', '?¤í›„(12-17)', '?€??18-23)'];
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

    // ìµœê·¼ ?°ì†??    int streakLoss = 0;
    for (final e in logs.reversed) {
      if (e.result == 'LOSS') streakLoss++;
      else if (e.result == 'WIN') break;
    }

    final tips = <String>[];
    if (total >= 5) {
      if (wr(low) + 0.10 < wr(high)) {
        tips.add('?©ì˜/? ë¢°ê°€ ??„ ???¤ì–´ê°€ë©??±ëŠ¥???¨ì–´?¸ìš” ???œë³´??ì´ˆë³´??ëª¨ë“œ ì¶”ì²œ');
      }
      if (long.isNotEmpty && short.isNotEmpty) {
        final lwr = wr(long);
        final swr = wr(short);
        if (lwr + 0.12 < swr) tips.add('ë¡±ì—?????ì£¼ ?¤íŒ¨?´ìš” ??ë¡?ê¸°ì?????ë¹¡ì„¸ê²?);
        if (swr + 0.12 < lwr) tips.add('?ì—?????ì£¼ ?¤íŒ¨?´ìš” ????ê¸°ì?????ë¹¡ì„¸ê²?);
      }
      if (bestWr >= 0.0) {
        tips.add('???˜ëŠ” ?œê°„?€: ${labels[bestIdx]} (ìµœê·¼ ê¸°ë¡ ê¸°ì?)');
      }
    }
    if (streakLoss >= 2) tips.add('?°ì† ?¨ë°° ì¤‘ì´?ìš” ????0ë¶??¬ê¸°???ëŠ” ì´ˆë³´ ëª¨ë“œë¡???¶”ê¸?);

    if (tips.isEmpty) tips.add('ì§€ê¸ˆì? ê¸°ë¡???ì–´???•ì‹¤???¨í„´???†ì–´?? ?œë³¸???“ì´ë©????•í™•?´ì ¸??');

    final s1 = '?¹ë¥  ${(winRate*100).toStringAsFixed(1)}% (??$wins / ??$losses)';
    final s2 = 'ë¡?${(wr(long)*100).toStringAsFixed(1)}% ????${(wr(short)*100).toStringAsFixed(1)}%';
    final s3 = 'ê¸°ì? ?µê³¼(? ë¢°??0 & ?©ì˜??0) ${(wr(high)*100).toStringAsFixed(1)}% ??ë¯¸ë‹¬ ${(wr(low)*100).toStringAsFixed(1)}%';
    return [
      'AI ì½”ì¹˜ ?”ì•½',
      s1,
      s2,
      s3,
      '',
      '?¤ëŠ˜??ì¡°ì–¸',
      for (final t in tips.take(5)) '??$t',
    ].join('\n');
  }
}
