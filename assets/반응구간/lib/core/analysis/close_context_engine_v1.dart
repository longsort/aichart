import '../models/fu_state.dart';

class CloseContextV1 {
  final String labelKo; // 강함/보통/약함/함정
  final int score; // 0~100
  final String reason;
  final double bodyPct; // 0~1
  final double wickUpPct; // 0~1
  final double wickDnPct; // 0~1
  const CloseContextV1({
    required this.labelKo,
    required this.score,
    required this.reason,
    required this.bodyPct,
    required this.wickUpPct,
    required this.wickDnPct,
  });
}

/// 종가(마감) 품질 간단 판정
/// - 마지막 캔들(최신) 기준으로 바디/꼬리/종가 위치를 점수화
/// - 전문용어 최소화(초보용 한글)
class CloseContextEngineV1 {
  const CloseContextEngineV1();

  /// 기존 FuEngine 호환용(정적 호출)
  /// - FuState 없이 캔들만으로 간단 판정
  static CloseContextV1 eval(List<FuCandle> candles) {
    if (candles.isEmpty) {
      return const CloseContextV1(
        labelKo: '대기',
        score: 0,
        reason: '캔들 데이터 없음',
        bodyPct: 0,
        wickUpPct: 0,
        wickDnPct: 0,
      );
    }
    final c = candles.last;
    final range = (c.high - c.low).abs();
    if (range <= 0) {
      return const CloseContextV1(
        labelKo: '대기',
        score: 0,
        reason: '변동 없음',
        bodyPct: 0,
        wickUpPct: 0,
        wickDnPct: 0,
      );
    }

    final body = (c.close - c.open).abs();
    final upperWick = (c.high - (c.open > c.close ? c.open : c.close)).clamp(0, double.infinity);
    final lowerWick = ((c.open < c.close ? c.open : c.close) - c.low).clamp(0, double.infinity);

    final bodyPct = (body / range).clamp(0.0, 1.0);
    final wickUpPct = (upperWick / range).clamp(0.0, 1.0);
    final wickDnPct = (lowerWick / range).clamp(0.0, 1.0);
    final closePos = ((c.close - c.low) / range).clamp(0.0, 1.0);

    int score = (bodyPct * 60 + closePos * 40).round().clamp(0, 100);
    if (wickUpPct >= 0.45 && closePos <= 0.55) {
      score = (score * 0.7).round();
      return CloseContextV1(
        labelKo: '함정주의',
        score: score,
        reason: '윗꼬리 길고 위에서 못 버팀',
        bodyPct: bodyPct,
        wickUpPct: wickUpPct,
        wickDnPct: wickDnPct,
      );
    }
    if (bodyPct >= 0.55 && closePos >= 0.72) {
      return CloseContextV1(
        labelKo: '강한 마감',
        score: score,
        reason: '몸통 큼 + 위에서 마감',
        bodyPct: bodyPct,
        wickUpPct: wickUpPct,
        wickDnPct: wickDnPct,
      );
    }
    if (bodyPct <= 0.28 && closePos <= 0.35) {
      score = (score * 0.85).round();
      return CloseContextV1(
        labelKo: '약한 마감',
        score: score,
        reason: '몸통 작고 아래로 마감',
        bodyPct: bodyPct,
        wickUpPct: wickUpPct,
        wickDnPct: wickDnPct,
      );
    }
    return CloseContextV1(
      labelKo: '보통',
      score: score,
      reason: closePos >= 0.5 ? '위쪽 마감(무난)' : '아래쪽 마감(무난)',
      bodyPct: bodyPct,
      wickUpPct: wickUpPct,
      wickDnPct: wickDnPct,
    );
  }

  CloseContextV1 analyze(FuState s) {
    final cs = s.candles;
    if (cs.isEmpty) {
      return const CloseContextV1(
        labelKo: '대기',
        score: 0,
        reason: '캔들 데이터 없음',
        bodyPct: 0,
        wickUpPct: 0,
        wickDnPct: 0,
      );
    }
    final c = cs.last;
    final range = (c.high - c.low).abs();
    if (range <= 0) {
      return const CloseContextV1(
        labelKo: '대기',
        score: 0,
        reason: '변동 없음',
        bodyPct: 0,
        wickUpPct: 0,
        wickDnPct: 0,
      );
    }

    final body = (c.close - c.open).abs();
    final upperWick = (c.high - (c.open > c.close ? c.open : c.close)).clamp(0, double.infinity);
    final lowerWick = ((c.open < c.close ? c.open : c.close) - c.low).clamp(0, double.infinity);

    final bodyPct = (body / range).clamp(0.0, 1.0);
    final wickUpPct = (upperWick / range).clamp(0.0, 1.0);
    final wickDnPct = (lowerWick / range).clamp(0.0, 1.0);

    // 종가 위치(상단/중단/하단)
    final closePos = ((c.close - c.low) / range).clamp(0.0, 1.0);

    // 점수(휴리스틱)
    int score = (bodyPct * 60 + closePos * 40).round().clamp(0, 100);

    // 함정: 윗꼬리 과다 + 종가가 위에서 못 버팀
    if (wickUpPct >= 0.45 && closePos <= 0.55) {
      score = (score * 0.7).round();
      return CloseContextV1(
        labelKo: '함정주의',
        score: score,
        reason: '윗꼬리 길고 위에서 못 버팀',
        bodyPct: bodyPct,
        wickUpPct: wickUpPct,
        wickDnPct: wickDnPct,
      );
    }

    // 강함: 바디 큼 + 종가 상단 마감
    if (bodyPct >= 0.55 && closePos >= 0.72) {
      return CloseContextV1(
        labelKo: '강한 마감',
        score: score,
        reason: '몸통 큼 + 위에서 마감',
        bodyPct: bodyPct,
        wickUpPct: wickUpPct,
        wickDnPct: wickDnPct,
      );
    }

    // 약함: 바디 작음 + 종가 하단
    if (bodyPct <= 0.28 && closePos <= 0.35) {
      score = (score * 0.85).round();
      return CloseContextV1(
        labelKo: '약한 마감',
        score: score,
        reason: '몸통 작고 아래로 마감',
        bodyPct: bodyPct,
        wickUpPct: wickUpPct,
        wickDnPct: wickDnPct,
      );
    }

    return CloseContextV1(
      labelKo: '보통',
      score: score,
      reason: closePos >= 0.5 ? '위쪽 마감(무난)' : '아래쪽 마감(무난)',
      bodyPct: bodyPct,
      wickUpPct: wickUpPct,
      wickDnPct: wickDnPct,
    );
  }
}
