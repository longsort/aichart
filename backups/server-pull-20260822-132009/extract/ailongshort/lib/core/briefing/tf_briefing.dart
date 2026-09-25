
import '../models/fu_state.dart';
import '../utils/candle_close_util.dart';

class TfBriefing {
  final String tf;
  final DateTime nextClose;
  final Duration remain;
  final String badge; // B / S / W
  final String title; // e.g. "4h 마감 브리??
  final double nowPrice;

  // "마감 ?�착" 기�????�심)
  final double settleLevel;
  final bool settleIsAbove; // true=?�로 ?�착?�야 강세, false=?�래�??�착?�야 ?�세

  // ?�나리오
  final String primaryScenario;
  final String failScenario;

  // ?�상 ?�벨
  final double pullback;
  final double target1;
  final double target2;
  final double invalidation;

  // 진짜 ?�이???��?
  final bool online;

  const TfBriefing({
    required this.tf,
    required this.nextClose,
    required this.remain,
    required this.badge,
    required this.title,
    required this.nowPrice,
    required this.settleLevel,
    required this.settleIsAbove,
    required this.primaryScenario,
    required this.failScenario,
    required this.pullback,
    required this.target1,
    required this.target2,
    required this.invalidation,
    required this.online,
  });

  String get remainText => CandleCloseUtil.fmtRemain(remain);
}

class TfBriefingEngine {
  static TfBriefing build({
    required FuState s,
    required String tf,
    required bool online,
  }) {
    final next = CandleCloseUtil.nextCloseFor(tf);
    final remain = next.difference(DateTime.now());

    final pulse = s.mtfPulse[tf] ?? FuTfPulse.empty();
    final dir = pulse.dir.toUpperCase();

    // Badge mapping
    String badge = 'W';
    if (dir == 'LONG') badge = 'B';
    if (dir == 'SHORT') badge = 'S';

    // settle level: prefer breakLevel if present, else reactLevel, else vwap
    double settleLevel = (s.breakLevel > 0 ? s.breakLevel : (s.reactLevel > 0 ? s.reactLevel : s.vwap));
    if (settleLevel <= 0) settleLevel = s.price;

    // For LONG, want close above settle; for SHORT, want close below settle.
    final settleIsAbove = (dir != 'SHORT');

    // targets/pullback using available state levels
    final pullback = _pickPullback(s, dir);
    final t1 = _pickTarget1(s, dir);
    final t2 = _pickTarget2(s, dir);

    final invalid = _pickInvalidation(s, dir);

    final primary = _primaryText(tf, dir, settleLevel, t1, t2);
    final fail = _failText(dir, invalid);

    return TfBriefing(
      tf: tf,
      nextClose: next,
      remain: remain.isNegative ? Duration.zero : remain,
      badge: online ? badge : 'W',
      title: '${tf} 마감 브리??,
      nowPrice: s.price,
      settleLevel: settleLevel,
      settleIsAbove: settleIsAbove,
      primaryScenario: online ? primary : '?�이???�결 ?��? 마감 ?�단 비활??,
      failScenario: online ? fail : 'OFFLINE/DEMO',
      pullback: pullback,
      target1: t1,
      target2: t2,
      invalidation: invalid,
      online: online,
    );
  }

  static double _pickPullback(FuState s, String dir){
    if (dir == 'SHORT') {
      // pullback for short is retest higher
      if (s.r1 > 0) return s.r1;
      if (s.reactHigh > 0) return s.reactHigh;
      return s.price;
    } else {
      if (s.s1 > 0) return s.s1;
      if (s.reactLow > 0) return s.reactLow;
      return s.price;
    }
  }

  static double _pickTarget1(FuState s, String dir){
    if (dir == 'SHORT') {
      if (s.s1 > 0) return s.s1;
      if (s.zoneTargets.isNotEmpty && s.zoneTargets[0] > 0) return s.zoneTargets[0];
      return s.price;
    } else {
      if (s.r1 > 0) return s.r1;
      if (s.zoneTargets.isNotEmpty && s.zoneTargets[0] > 0) return s.zoneTargets[0];
      return s.price;
    }
  }

  static double _pickTarget2(FuState s, String dir){
    if (dir == 'SHORT') {
      if (s.zoneTargets.length > 1 && s.zoneTargets[1] > 0) return s.zoneTargets[1];
      if (s.s1 > 0) return s.s1 * 0.995;
      return s.price;
    } else {
      if (s.zoneTargets.length > 1 && s.zoneTargets[1] > 0) return s.zoneTargets[1];
      if (s.r1 > 0) return s.r1 * 1.005;
      return s.price;
    }
  }

  static double _pickInvalidation(FuState s, String dir){
    if (dir == 'SHORT') {
      if (s.zoneInvalid > 0) return s.zoneInvalid;
      if (s.reactHigh > 0) return s.reactHigh;
      return s.r1 > 0 ? s.r1 : s.price;
    } else {
      if (s.zoneInvalid > 0) return s.zoneInvalid;
      if (s.reactLow > 0) return s.reactLow;
      return s.s1 > 0 ? s.s1 : s.price;
    }
  }

  static String _primaryText(String tf, String dir, double settle, double t1, double t2){
    if (dir == 'SHORT') {
      return '마감??${_fmt(settle)} ?�래�??�착?�면 ?�락 ?�나리오 ?�성 ??${_fmt(t1)} / ${_fmt(t2)}';
    }
    if (dir == 'LONG') {
      return '마감??${_fmt(settle)} ?�로 ?�착?�면 ?�승 ?�나리오 ?�성 ??${_fmt(t1)} / ${_fmt(t2)}';
    }
    return '방향 불확?? 마감 결과�??�나리오 결정';
  }

  static String _failText(String dir, double invalid){
    if (dir == 'SHORT') return '무효: ${_fmt(invalid)} ???�복 ?????�나리오 종료';
    if (dir == 'LONG') return '무효: ${_fmt(invalid)} ?�탈 ??�??�나리오 종료';
    return '무효: 구조 붕괴 ??관�?;
  }

  static String _fmt(double v) => v == 0 ? '-' : v.toStringAsFixed(0);
}
