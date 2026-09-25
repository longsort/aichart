
import '../models/fu_state.dart';

class ZoneResult {
  final String code; // DEFENSE/REBOUND/PULLBACK_REBOUND/ABSORB_BUY/DISTRIBUTION_SELL/DANGER/NONE
  final String name; // ?��? ?�벨
  final String bias; // LONG/SHORT/NEUTRAL
  final int strength; // 0~100
  final int longP;
  final int shortP;
  final int waitP;
  final String trigger;
  final String invalidLine;
  final List<String> reasons; // 최�? 3�?
  const ZoneResult({
    required this.code,
    required this.name,
    required this.bias,
    required this.strength,
    required this.longP,
    required this.shortP,
    required this.waitP,
    required this.trigger,
    required this.invalidLine,
    required this.reasons,
  });
}

class ZoneClassifierV1 {
  const ZoneClassifierV1();

  static int _clampI(num v, [int lo = 0, int hi = 100]) => v.round().clamp(lo, hi);

  double _distPct(double a, double b) {
    if (a <= 0 || b <= 0) return 999.0;
    return ((a - b).abs() / a) * 100.0;
  }

  bool _near(double px, double lvl, {double pct = 0.18}) {
    if (px <= 0 || lvl <= 0) return false;
    return _distPct(px, lvl) <= pct;
  }

  ZoneResult classify(FuState s) {
    final px = s.price > 0 ? s.price : s.livePrice;
    final sweep = s.sweepRisk.clamp(0, 100);
    final ob = s.obImbalance; // ratio 기반(±)?��?�??��? dto??0~100???�어 ?�전처리
    final tape = s.tapeBuyPct.clamp(0, 100);
    final inst = s.instBias.clamp(0, 100);
    final force = s.forceScore.clamp(0, 100);
    final absorb = s.absorptionScore.clamp(0, 100);

    // 근접 ?�벨(반응구간/지지/?�?? 추정
    final support = (s.reactLow > 0) ? s.reactLow : s.s1;
    final resist = (s.reactHigh > 0) ? s.reactHigh : s.r1;
    final nearSup = _near(px, support, pct: 0.25) || (s.reactLow > 0 && s.reactHigh > 0 && px >= s.reactLow && px <= s.reactHigh);
    final nearRes = _near(px, resist, pct: 0.25);

    // ?�험 ?�선
    if (sweep >= 75 || s.risk >= 80) {
      return const ZoneResult(
        code: 'DANGER',
        name: '?�험/관�?,
        bias: 'NEUTRAL',
        strength: 90,
        longP: 10,
        shortP: 10,
        waitP: 80,
        trigger: '관�??�윕/리스??과다)',
        invalidLine: '?�윕 ?�험 ?�음',
        reasons: ['?�윕리스???�음', '변?�성/리스???�음', '?�호 보류'],
      );
    }

    // --- scoring ---
    int defense = 0;
    if (nearSup) defense += 25;
    if (tape >= 52) defense += 20;
    if (inst >= 55) defense += 15;
    if (ob >= 10) defense += 15;
    if (s.hasStructure) defense += 10;
    defense -= (sweep >= 55) ? 10 : 0;

    int rebound = 0;
    final tag = s.structureTag.toUpperCase();
    if (tag.contains('CHOCH_UP') || tag.contains('BOS_UP') || tag.contains('MSB_UP')) rebound += 30;
    if (!nearSup && s.breakLevel > 0 && px >= s.breakLevel) rebound += 15;
    if (tape >= 55) rebound += 20;
    if (force >= 60) rebound += 15;
    if (s.zoneValidInt >= 60) rebound += 10;
    rebound -= (sweep >= 55) ? 10 : 0;

    int pullback = 0;
    if (tag.contains('BOS_UP') || tag.contains('CHOCH_UP')) pullback += 25;
    if (nearSup) pullback += 20;
    if (tape >= 50) pullback += 15;
    if (ob >= 0) pullback += 10;
    if (inst >= 55) pullback += 10;
    if (s.tfAgree) pullback += 10;

    int absorbBuy = 0;
    if (nearSup) absorbBuy += 15;
    if (absorb >= 60) absorbBuy += 25;
    if (force >= 60) absorbBuy += 20;
    if (tape <= 50 && ob >= 10) absorbBuy += 20; // 매도체결 비중???�아???��?가 받치??케?�스
    if (inst >= 55) absorbBuy += 10;

    int distSell = 0;
    if (nearRes) distSell += 25;
    if (tag.contains('CHOCH_DN') || tag.contains('BOS_DN')) distSell += 20;
    if (tape >= 55 && ob <= -5) distSell += 20; // 매수체결?� ?�오?�데 ?��?가 받치지 ?�는 ?�단
    if (inst <= 45) distSell += 15;
    if (s.zoneValidInt >= 60) distSell += 10;

    // ?�택
    final m = <String, int>{
      'DEFENSE': defense,
      'REBOUND': rebound,
      'PULLBACK_REBOUND': pullback,
      'ABSORB_BUY': absorbBuy,
      'DISTRIBUTION_SELL': distSell,
    };

    String best = 'DEFENSE';
    int bestScore = -999;
    m.forEach((k, v) {
      if (v > bestScore) {
        best = k;
        bestScore = v;
      }
    });
    bestScore = bestScore.clamp(0, 100);

    // bias + probs
    String bias = 'NEUTRAL';
    String name = '중립구간';
    String trigger = '';
    String invalid = '';
    final reasons = <String>[];

    int longP = 33, shortP = 33, waitP = 34;

    void setProbs({required bool longBias}) {
      final base = 50 + ((bestScore - 50) * 0.6);
      final p = _clampI(base);
      if (longBias) {
        longP = p;
        shortP = _clampI(100 - p - 10);
        waitP = _clampI(100 - longP - shortP);
      } else {
        shortP = p;
        longP = _clampI(100 - p - 10);
        waitP = _clampI(100 - longP - shortP);
      }
    }

    if (best == 'DEFENSE') {
      bias = 'LONG';
      name = '방어구간';
      setProbs(longBias: true);
      trigger = '지지 ?��? ???�림 �?;
      invalid = (support > 0) ? '무효: ${support.toStringAsFixed(0)} ?�탈' : '무효: 지지 ?�탈';
      if (nearSup) reasons.add('지지/반응구간 근접');
      if (tape >= 52) reasons.add('체결 매수 ?�위(${tape}%)');
      if (ob >= 10) reasons.add('?�더�?매수 ?�위');
    } else if (best == 'REBOUND') {
      bias = 'LONG';
      name = '반등구간';
      setProbs(longBias: true);
      trigger = '리클?�임 ???�림 진입';
      invalid = (support > 0) ? '무효: ${support.toStringAsFixed(0)} ?�이?? : '무효: 반응구간 ?�이??;
      reasons.add('구조???�향(${s.structureTag})');
      if (tape >= 55) reasons.add('체결 매수 강함(${tape}%)');
      if (force >= 60) reasons.add('반응강도 ?�음');
    } else if (best == 'PULLBACK_REBOUND') {
      bias = 'LONG';
      name = '?�림반등';
      setProbs(longBias: true);
      trigger = '직전 고점 ?�복 ??�?;
      invalid = (support > 0) ? '무효: ${support.toStringAsFixed(0)} ?�탈' : '무효: ?�림 ?�???�탈';
      if (s.tfAgree) reasons.add('?�위TF ?�의');
      if (nearSup) reasons.add('?�림 구간 진입');
      reasons.add('구조???�향 ?��?');
    } else if (best == 'ABSORB_BUY') {
      bias = 'LONG';
      name = '?�력매수(?�수)';
      setProbs(longBias: true);
      trigger = '?�파 ?�리거형(급등 가??';
      invalid = (support > 0) ? '무효: ${support.toStringAsFixed(0)} ?�탈' : '무효: ?�수 ?�패';
      if (absorb >= 60) reasons.add('?�수?�수 ?�음(${absorb})');
      if (force >= 60) reasons.add('반응강도 ?�음(${force})');
      reasons.add('?��? 방어 ?�세');
    } else if (best == 'DISTRIBUTION_SELL') {
      bias = 'SHORT';
      name = '분산매도';
      setProbs(longBias: false);
      trigger = '?�단 ?�패 ????;
      invalid = (resist > 0) ? '무효: ${resist.toStringAsFixed(0)} ?�향?�파' : '무효: ?�단 ?�파';
      if (nearRes) reasons.add('?�???�단 근접');
      if (ob <= -5) reasons.add('?�더�?매도 ?�위');
      if (inst <= 45) reasons.add('기�?/?�력 매도?�세');
    }

    // fallback safety
    if (bestScore < 55) {
      bias = 'NEUTRAL';
      name = '중립/?��?;
      longP = 35; shortP = 35; waitP = 30;
      trigger = '?��?근거 부�?';
      invalid = '근거 부�?;
      reasons
        ..clear()
        ..add('구간 ?�수 ??��(${bestScore})')
        ..add('추�? ?�증 ?�요');
    }

    // cap to 3 reasons
    final r = reasons.take(3).toList(growable: false);

    return ZoneResult(
      code: best,
      name: name,
      bias: bias,
      strength: bestScore,
      longP: longP.clamp(0, 100),
      shortP: shortP.clamp(0, 100),
      waitP: waitP.clamp(0, 100),
      trigger: trigger,
      invalidLine: invalid,
      reasons: r,
    );
  }
}
