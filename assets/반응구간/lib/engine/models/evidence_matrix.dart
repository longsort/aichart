import 'engine_output.dart';
import 'struct_event.dart';

/// S-13: 신뢰도 투명화 — TF×근거 점수판. 쉬운 한글 라벨(지지/저항/돌파/거래량 등).
class EvidenceMatrix {
  final List<EvidenceRow> rows;
  final int totalScore;

  EvidenceMatrix({required this.rows, required this.totalScore});

  /// EngineOutput에서 근거 매트릭스 생성
  static EvidenceMatrix fromEngineOutput(EngineOutput output) {
    final rows = <EvidenceRow>[];
    final events = output.events;

    final bosUp = events.any((e) => e.type == StructEventType.BOS_UP);
    rows.add(EvidenceRow(label: 'BOS 상승 돌파', score: bosUp ? 15 : 0));

    final bosDn = events.any((e) => e.type == StructEventType.BOS_DN);
    rows.add(EvidenceRow(label: 'BOS 하락 돌파', score: bosDn ? 15 : 0));

    final msbUp = events.any((e) => e.type == StructEventType.MSB_UP);
    rows.add(EvidenceRow(label: 'MSB 상승 지지', score: msbUp ? 15 : 0));

    final msbDn = events.any((e) => e.type == StructEventType.MSB_DN);
    rows.add(EvidenceRow(label: 'MSB 하락 저항', score: msbDn ? 15 : 0));

    final levelScore = (output.lines.length * 5).clamp(0, 25);
    rows.add(EvidenceRow(label: 'EQH/EQL 레벨', score: levelScore));

    final total = rows.fold<int>(0, (s, r) => s + r.score);
    return EvidenceMatrix(rows: rows, totalScore: total > 100 ? 100 : total);
  }
}

class EvidenceRow {
  final String label;
  final int score;

  EvidenceRow({required this.label, required this.score});
}
