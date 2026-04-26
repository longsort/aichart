import '../models/fu_state.dart';

/// 반응구간(지지/저항) 강도 점수화 엔진
///
/// 목적
/// - "약함/중간/강함/확정급" 4단계로 단순화
/// - "어디까지"(예상 목표 1/2/3)까지 함께 제공
///
/// NOTE
/// - 체결/오더북/CVD 실데이터가 붙기 전에는 공개 지표(세력/고래/흡수/리스크/구조)
///   기반 휴리스틱으로 동작한다.
/// - 이후 (1)체결 (2)오더북 (3)CVD가 들어오면 score 계산만 강화하면 UI/엔진 구조는 유지된다.

enum ReactionGrade { weak, mid, strong, confirm }

class ReactionStrength {
  final int score; // 0~100
  final ReactionGrade grade;
  final String gradeKo; // 약함/중간/강함/확정급
  final bool isBull; // 구조상 위쪽(UP) 반응이면 true
  final List<double> targets; // 예상 목표 1/2/3 (없으면 0)
  final String hint; // 짧은 근거 1줄

  const ReactionStrength({
    required this.score,
    required this.grade,
    required this.gradeKo,
    required this.isBull,
    required this.targets,
    required this.hint,
  });
}

class ReactionStrengthEngine {
  static ReactionStrength build(FuState s, {double? livePrice}) {
    final double p = (livePrice != null && livePrice > 0) ? livePrice : s.price;
    final String tag = s.structureTag.toUpperCase();
    final bool isBull = tag.contains('UP');

    // 반응구간 유효성
    final bool hasBand = (s.reactLow > 0 && s.reactHigh > 0);
    final bool inBand = hasBand && p > 0 && p >= s.reactLow && p <= s.reactHigh;

    // 기본 베이스
    double score = 50.0;

    // (A) 반응 구간 진입 보너스
    if (inBand) score += 14.0;

    // (B) 세력/고래/기관/흡수 보강 (0~100 -> -50~+50)
    score += (s.forceScore - 50) * 0.28;
    score += (s.whaleScore - 50) * 0.18;
    score += (s.instBias - 50) * 0.14;
    score += (s.absorptionScore - 50) * 0.20;

    // (C) 리스크(스윕) 페널티
    score -= (s.sweepRisk - 50) * 0.30;

    // (D) 합의/근거 보정: 근거가 많으면 확정급으로 올리기 쉬움
    score += (s.evidenceHit.clamp(0, 5) - 2) * 5.5;

    // (E) 구조 태그: CHOCH/BOS는 '반응 신뢰'에 소폭 가중
    if (tag.startsWith('CHOCH')) score += 5.0;
    if (tag.startsWith('BOS')) score += 3.0;

    // clamp
    int sc = score.round();
    if (sc < 0) sc = 0;
    if (sc > 100) sc = 100;

    // grade mapping
    ReactionGrade g;
    String gKo;
    if (sc >= 86) {
      g = ReactionGrade.confirm;
      gKo = '확정급';
    } else if (sc >= 72) {
      g = ReactionGrade.strong;
      gKo = '강함';
    } else if (sc >= 58) {
      g = ReactionGrade.mid;
      gKo = '중간';
    } else {
      g = ReactionGrade.weak;
      gKo = '약함';
    }

    // "어디까지"(목표) 계산
    // - 기본: ZoneEngine에서 만들어 둔 zoneTargets(롱 방향) 우선 사용
    // - 숏일 때는 간단히 대칭 목표를 만들어준다.
    List<double> targets = s.zoneTargets;
    if (targets.length < 3) {
      targets = const [0, 0, 0];
    }

    // zoneTargets가 비어있거나 0이면 S/R 기반으로 예측치 생성
    final bool targetsEmpty = targets.isEmpty || (targets[0] <= 0 && targets[1] <= 0);
    if (targetsEmpty && s.s1 > 0 && s.r1 > 0) {
      final double range = (s.r1 - s.s1).abs();
      if (range > 0) {
        if (isBull) {
          targets = [p + range * 0.25, p + range * 0.5, p + range * 0.8];
        } else {
          targets = [p - range * 0.25, p - range * 0.5, p - range * 0.8];
        }
      }
    } else {
      // 숏이면 대칭
      if (!isBull && p > 0 && targets.isNotEmpty && targets[0] > 0) {
        final double d1 = (targets[0] - p).abs();
        final double d2 = (targets.length > 1 ? (targets[1] - p).abs() : d1 * 2);
        final double d3 = (targets.length > 2 ? (targets[2] - p).abs() : d1 * 3);
        targets = [p - d1, p - d2, p - d3];
      }
    }

    // 힌트 한 줄
    final List<String> parts = [];
    if (inBand) parts.add('구간 진입');
    if (s.absorptionScore >= 62) parts.add('흡수↑');
    if (s.whaleScore >= 62) parts.add('고래↑');
    if (s.forceScore >= 62) parts.add('세력↑');
    if (s.sweepRisk >= 65) parts.add('스윕주의');
    final hint = parts.isEmpty ? '반응 강도 계산 중' : parts.join(' · ');

    return ReactionStrength(
      score: sc,
      grade: g,
      gradeKo: gKo,
      isBull: isBull,
      targets: targets,
      hint: hint,
    );
  }
}
