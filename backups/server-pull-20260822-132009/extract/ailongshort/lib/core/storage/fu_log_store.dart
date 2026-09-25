import '../models/fu_state.dart';
import '../diagnostics/engine_signal_hub.dart';

class FuLogEntry {
  final int ts;
  final double price;
  final int score, confidence, risk;
  final String decision, dir;
  final int prob;
  final int hit, total;

  FuLogEntry({
    required this.ts,
    required this.price,
    required this.score,
    required this.confidence,
    required this.risk,
    required this.decision,
    required this.dir,
    required this.prob,
    required this.hit,
    required this.total,
  });

  factory FuLogEntry.fromState(FuState s) => FuLogEntry(
    ts: DateTime.now().millisecondsSinceEpoch,
    price: s.price,
    score: s.score,
    confidence: s.confidence,
    risk: s.risk,
    decision: s.decisionTitle,
    dir: s.signalDir,
    prob: s.signalProb,
    hit: s.evidenceHit,
    total: s.evidenceTotal,
  );

  String toCsvRow() => '$ts,$price,$score,$confidence,$risk,$decision,$dir,$prob,$hit,$total';
}

class FuLogStore {
  /// ?�환?? 기존 코드?�서 FuLogStore.append(state) �??�출?�는 경우 지??  static void append(FuState s) => instance.add(FuLogEntry.fromState(s));

  FuLogStore._();
  static final FuLogStore instance = FuLogStore._();
  final List<FuLogEntry> _items = [];

  void add(FuLogEntry e) {
    _items.add(e);
    EngineSignalHub.I.mark('db', detail: '로그 ${_items.length}');
    if (_items.length > 5000) _items.removeRange(0, _items.length - 5000);
  }

  String exportCsv() {
    const header = 'ts,price,score,confidence,risk,decision,dir,prob,evidence_hit,evidence_total';
    final rows = _items.map((e) => e.toCsvRow()).join('\n');
    return '$header\n$rows';
  }
}
