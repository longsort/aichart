import '../models/ultra_result.dart';

/// 초보용 자동 복기 문장 생성기
class PostMortem {
  static String summarize({
    required String outcome,
    required UltraResult r,
    Map<String, int>? meters,
  }) {
    final o = outcome.toUpperCase();
    final risk = r.evidence.risk;
    final crowd = r.evidence.crowding;
    final flow = r.evidence.flow;
    final shape = r.evidence.shape;
    final big = r.evidence.bigHand;

    // 약한 항목 2개 뽑기
    final pairs = <MapEntry<String, int>>[
      MapEntry('흐름(체결)', flow),
      MapEntry('구조(패턴)', shape),
      MapEntry('세력(고래)', big),
      MapEntry('쏠림', crowd),
      MapEntry('위험', risk),
    ]..sort((a, b) => a.value.compareTo(b.value));
    final weak1 = pairs.first;
    final weak2 = pairs.length > 1 ? pairs[1] : pairs.first;

    final lockHint = (meters != null && (meters['위험도'] ?? 0) >= 75)
        ? ' (다음엔 LOCK 기준에 더 가까움)'
        : '';

    if (o == 'WIN') {
      return '✅ 성공: ${r.decision.title} / 신뢰 ${r.decision.confidence}%. 약점은 ${weak1.key}(${weak1.value})였지만 버팀.$lockHint';
    }
    if (o == 'LOSS') {
      return '❌ 실패: ${r.decision.title}. 약한 근거: ${weak1.key}(${weak1.value}), ${weak2.key}(${weak2.value}). 다음엔 이 2개가 60↑일 때만 진입 추천.$lockHint';
    }
    return '➖ 보합: ${r.decision.title}. 애매한 구간이라 손익이 크지 않음. 약한 근거: ${weak1.key}(${weak1.value}).';
  }
}
