import 'dart:convert';
import 'dart:io';

class TradeJournalEntry {
  final DateTime time;
  final String symbol;
  final String tf;
  final String decision;
  final int confidence;
  final int coreScore;
  final Map<String, int> evidence;

  /// ?�용???�드�?기반 결과 기록 (?�택)
  /// WIN / LOSS / BE
  final String? outcome;

  /// 간단 복기 메모(?�동/?�동)
  final String? note;

  TradeJournalEntry({
    required this.time,
    required this.symbol,
    required this.tf,
    required this.decision,
    required this.confidence,
    required this.coreScore,
    required this.evidence,
    this.outcome,
    this.note,
  });

  Map<String, dynamic> toJson() => {
        'time': time.toIso8601String(),
        'symbol': symbol,
        'tf': tf,
        'decision': decision,
        'confidence': confidence,
        'coreScore': coreScore,
        'evidence': evidence,
        'outcome': outcome,
        'note': note,
      };

  static TradeJournalEntry fromJson(Map<String, dynamic> j) {
    return TradeJournalEntry(
      time: DateTime.parse(j['time']),
      symbol: j['symbol'],
      tf: j['tf'],
      decision: j['decision'],
      confidence: j['confidence'],
      coreScore: j['coreScore'],
      evidence: Map<String, int>.from(j['evidence']),
      outcome: j['outcome'],
      note: j['note'],
    );
  }
}

class TradeJournal {
  final String path;
  TradeJournal({this.path = 'fulink_logs.jsonl'});

  Future<void> append(TradeJournalEntry e) async {
    final file = File(path);
    await file.writeAsString(
      jsonEncode(e.toJson()) + '\n',
      mode: FileMode.append,
      flush: true,
    );
  }

  Future<List<TradeJournalEntry>> recent({int limit = 10}) async {
    final file = File(path);
    if (!await file.exists()) return [];
    final lines = await file.readAsLines();
    final slice = lines.length > limit ? lines.sublist(lines.length - limit) : lines;
    return slice.map((l) => TradeJournalEntry.fromJson(jsonDecode(l))).toList();
  }
}