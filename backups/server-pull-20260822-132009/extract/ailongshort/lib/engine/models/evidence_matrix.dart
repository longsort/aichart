import 'engine_output.dart';
import 'struct_event.dart';

/// S-13: ? ë¢°???¬ëª…????TFÃ—ê·¼ê±° ?ìˆ˜?? ?¬ìš´ ?œê? ?¼ë²¨(ì§€ì§€/?€???ŒíŒŒ/ê±°ë˜????.
class EvidenceMatrix {
  final List<EvidenceRow> rows;
  final int totalScore;

  EvidenceMatrix({required this.rows, required this.totalScore});

  /// EngineOutput?ì„œ ê·¼ê±° ë§¤íŠ¸ë¦?Š¤ ?ì„±
  static EvidenceMatrix fromEngineOutput(EngineOutput output) {
    final rows = <EvidenceRow>[];
    final events = output.events;

    final bosUp = events.any((e) => e.type == StructEventType.BOS_UP);
    rows.add(EvidenceRow(label: 'BOS ?ìŠ¹ ?ŒíŒŒ', score: bosUp ? 15 : 0));

    final bosDn = events.any((e) => e.type == StructEventType.BOS_DN);
    rows.add(EvidenceRow(label: 'BOS ?˜ë½ ?ŒíŒŒ', score: bosDn ? 15 : 0));

    final msbUp = events.any((e) => e.type == StructEventType.MSB_UP);
    rows.add(EvidenceRow(label: 'MSB ?ìŠ¹ ì§€ì§€', score: msbUp ? 15 : 0));

    final msbDn = events.any((e) => e.type == StructEventType.MSB_DN);
    rows.add(EvidenceRow(label: 'MSB ?˜ë½ ?€??, score: msbDn ? 15 : 0));

    final levelScore = (output.lines.length * 5).clamp(0, 25);
    rows.add(EvidenceRow(label: 'EQH/EQL ?ˆë²¨', score: levelScore));

    final total = rows.fold<int>(0, (s, r) => s + r.score);
    return EvidenceMatrix(rows: rows, totalScore: total > 100 ? 100 : total);
  }
}

class EvidenceRow {
  final String label;
  final int score;

  EvidenceRow({required this.label, required this.score});
}
