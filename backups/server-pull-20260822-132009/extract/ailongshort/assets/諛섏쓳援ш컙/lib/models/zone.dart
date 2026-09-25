// lib/models/zone.dart

enum ZoneType { support, resistance, box }

class ZoneCandidate {
  final ZoneType type;
  final double low;
  final double high;
  final int score; // 0..100
  final String reason;

  const ZoneCandidate({
    required this.type,
    required this.low,
    required this.high,
    required this.score,
    required this.reason,
  });

  String get label {
    switch (type) {
      case ZoneType.support:
        return '지지';
      case ZoneType.resistance:
        return '저항';
      case ZoneType.box:
        return '박스';
    }
  }

  double get mid => (low + high) / 2.0;
}

class ZoneStrength {
  final int absorption; // 0..100 (흡수/방어)
  final int breakout; // 0..100 (뚫릴 압력)
  final double buyVol;
  final double sellVol;
  final int holdSec;

  // 과거 유사(캔들 기반) 통계
  final int samples;
  final double upProb1; // 0..1
  final double avgUp1; // +%
  final double avgDown1; // -%
  final double upProb3;
  final double avgUp3;
  final double avgDown3; // -%
  final double failProb3;
  final double mfe5; // +%
  final double mae5; // -%

  // 5봉 종가 기준(확률/평균)
  final double upProb5; // 0..1
  final double avgUp5; // +%
  final double avgDown5; // -%

  const ZoneStrength({
    required this.absorption,
    required this.breakout,
    required this.buyVol,
    required this.sellVol,
    required this.holdSec,
    required this.samples,
    required this.upProb1,
    required this.avgUp1,
    required this.avgDown1,
    required this.upProb3,
    required this.avgUp3,
    this.avgDown3 = 0,
    required this.failProb3,
    required this.mfe5,
    required this.mae5,
    this.upProb5 = 0,
    this.avgUp5 = 0,
    this.avgDown5 = 0,
  });

  String get status {
    if (absorption >= 80 && breakout < 55) return '방어 강함';
    if (breakout >= 80) return '뚫림 임박';
    if (absorption >= 60) return '방어 진행';
    if (breakout >= 60) return '뚫림 압력';
    return '중립';
  }
}
