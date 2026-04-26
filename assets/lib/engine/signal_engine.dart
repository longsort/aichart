
enum SignalSide { long, short, wait }

class SignalResult {
  final SignalSide side;
  final String strength;
  final int evidenceHit;
  final int evidenceTotal;
  final String reason;

  SignalResult({
    required this.side,
    required this.strength,
    required this.evidenceHit,
    required this.evidenceTotal,
    required this.reason,
  });
}

class SignalEngine {
  static SignalResult evaluate() {
    final hit = 4;
    final total = 5;
    return SignalResult(
      side: SignalSide.short,
      strength: "강",
      evidenceHit: hit,
      evidenceTotal: total,
      reason: "종가 하단 안착 + 저항 반락 + 파동 하락",
    );
  }
}
