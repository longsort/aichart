// lib/logic/tf_consensus.dart
import 'package:ailongshort/models/ultra_result.dart';

class TfConsensusRow {
  final String tf;
  final UltraResult r;

  const TfConsensusRow({required this.tf, required this.r});

  int get hit5 {
    int hit = 0;
    if (r.evidence.flow >= 60) hit++;
    if (r.evidence.shape >= 60) hit++;
    if (r.evidence.bigHand >= 60) hit++;
    if (r.evidence.crowding >= 60) hit++;
    if (r.evidence.risk <= 55) hit++; // risk????„?˜ë¡ ì¢‹ìŒ
    return hit;
  }

  String get dir {
    final t = r.decision.title;
    if (t.contains('??) || t.toLowerCase().contains('short')) return 'SHORT';
    if (t.contains('ë¡?) || t.toLowerCase().contains('long') || t.contains('?ìŠ¹')) return 'LONG';
    return 'NO';
  }
}

class TfConsensus {
  static int agreeCount(List<TfConsensusRow> rows) {
    final longs = rows.where((e) => e.dir == 'LONG').length;
    final shorts = rows.where((e) => e.dir == 'SHORT').length;
    final maj = (longs >= shorts) ? 'LONG' : 'SHORT';
    return rows.where((e) => e.dir == maj).length;
  }

  static bool confirm(List<TfConsensusRow> rows) {
    final strong = rows.where((e) => e.hit5 >= 5).length;
    final agree = agreeCount(rows);
    return strong >= 2 && agree >= 3;
  }

  static String majorityDir(List<TfConsensusRow> rows) {
    final longs = rows.where((e) => e.dir == 'LONG').length;
    final shorts = rows.where((e) => e.dir == 'SHORT').length;
    if (longs == 0 && shorts == 0) return 'NO';
    return (longs >= shorts) ? 'LONG' : 'SHORT';
  }
}