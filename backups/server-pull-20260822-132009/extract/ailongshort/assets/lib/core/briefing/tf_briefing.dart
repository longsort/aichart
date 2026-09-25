
import '../models/fu_state.dart';
import '../utils/candle_close_util.dart';

class TfBriefing {
  final String tf;
  final DateTime nextClose;
  final Duration remain;
  final String badge; // B / S / W
  final String title; // e.g. "4h 마감 브리핑"
  final double nowPrice;

  // "마감 안착" 기준선(핵심)
  final double settleLevel;
  final bool settleIsAbove; // true=위로 안착해야 강세, false=아래로 안착해야 약세

  // 시나리오
  final String primaryScenario;
  final String failScenario;

  // 예상 레벨
  final double pullback;
  final double target1;
  final double target2;
  final double invalidation;

  // 진짜 데이터 여부
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
      title: '${tf} 마감 브리핑',
      nowPrice: s.price,
      settleLevel: settleLevel,
      settleIsAbove: settleIsAbove,
      primaryScenario: online ? primary : '데이터 연결 대기: 마감 판단 비활성',
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
      return '마감이 ${_fmt(settle)} 아래로 안착하면 하락 시나리오 활성 → ${_fmt(t1)} / ${_fmt(t2)}';
    }
    if (dir == 'LONG') {
      return '마감이 ${_fmt(settle)} 위로 안착하면 상승 시나리오 활성 → ${_fmt(t1)} / ${_fmt(t2)}';
    }
    return '방향 불확실: 마감 결과로 시나리오 결정';
  }

  static String _failText(String dir, double invalid){
    if (dir == 'SHORT') return '무효: ${_fmt(invalid)} 위 회복 시 숏 시나리오 종료';
    if (dir == 'LONG') return '무효: ${_fmt(invalid)} 이탈 시 롱 시나리오 종료';
    return '무효: 구조 붕괴 시 관망';
  }

  static String _fmt(double v) => v == 0 ? '-' : v.toStringAsFixed(0);
}
