class SignalLog {
  final int? id;
  final int ts;
  final String symbol;
  final String tf;
  final String dir;
  final int prob;
  final int evidenceHit;
  final int evidenceTotal;
  final int score;
  final int confidence;
  final int risk;
  final double entry;
  final double sl;
  final double tp;
  final double qty;
  final double leverage;

  String status; // OPEN/CLOSED
  String result; // WIN/LOSS/NONE
  double? exitPrice;
  int? closedTs;

  SignalLog({
    required this.id,
    required this.ts,
    required this.symbol,
    required this.tf,
    required this.dir,
    required this.prob,
    required this.evidenceHit,
    required this.evidenceTotal,
    required this.score,
    required this.confidence,
    required this.risk,
    required this.entry,
    required this.sl,
    required this.tp,
    required this.qty,
    required this.leverage,
    this.status = 'OPEN',
    this.result = 'NONE',
    this.exitPrice,
    this.closedTs,
  });

  SignalLog copyWith({
    int? id,
    int? ts,
    String? status,
    String? result,
    double? exitPrice,
    int? closedTs,
  }) {
    final x = SignalLog(
      id: id ?? this.id,
      ts: ts ?? this.ts,
      symbol: symbol,
      tf: tf,
      dir: dir,
      prob: prob,
      evidenceHit: evidenceHit,
      evidenceTotal: evidenceTotal,
      score: score,
      confidence: confidence,
      risk: risk,
      entry: entry,
      sl: sl,
      tp: tp,
      qty: qty,
      leverage: leverage,
      status: status ?? this.status,
      result: result ?? this.result,
      exitPrice: exitPrice ?? this.exitPrice,
      closedTs: closedTs ?? this.closedTs,
    );
    return x;
  }

  Map<String, Object?> toMap({bool includeId = true}) => <String, Object?>{
    if (includeId) 'id': id,
    'ts': ts,
    'symbol': symbol,
    'tf': tf,
    'dir': dir,
    'prob': prob,
    'evidenceHit': evidenceHit,
    'evidenceTotal': evidenceTotal,
    'score': score,
    'confidence': confidence,
    'risk': risk,
    'entry': entry,
    'sl': sl,
    'tp': tp,
    'qty': qty,
    'leverage': leverage,
    'status': status,
    'result': result,
    'exitPrice': exitPrice,
    'closedTs': closedTs,
  };

  factory SignalLog.fromMap(Map<String, Object?> m) {
    int? _i(String k) {
      final v = m[k];
      if (v == null) return null;
      if (v is int) return v;
      if (v is num) return v.toInt();
      return int.tryParse(v.toString());
    }

    double _d(String k) {
      final v = m[k];
      if (v == null) return 0.0;
      if (v is double) return v;
      if (v is num) return v.toDouble();
      return double.tryParse(v.toString()) ?? 0.0;
    }

    String _s(String k) => (m[k] ?? '').toString();

    return SignalLog(
      id: _i('id'),
      ts: _i('ts') ?? DateTime.now().millisecondsSinceEpoch,
      symbol: _s('symbol'),
      tf: _s('tf'),
      dir: _s('dir'),
      prob: _i('prob') ?? 0,
      evidenceHit: _i('evidenceHit') ?? 0,
      evidenceTotal: _i('evidenceTotal') ?? 0,
      score: _i('score') ?? 0,
      confidence: _i('confidence') ?? 0,
      risk: _i('risk') ?? 0,
      entry: _d('entry'),
      sl: _d('sl'),
      tp: _d('tp'),
      qty: _d('qty'),
      leverage: _d('leverage'),
      status: _s('status').isEmpty ? 'OPEN' : _s('status'),
      result: _s('result').isEmpty ? 'NONE' : _s('result'),
      exitPrice: m['exitPrice'] == null ? null : _d('exitPrice'),
      closedTs: _i('closedTs'),
    );
  }
}
