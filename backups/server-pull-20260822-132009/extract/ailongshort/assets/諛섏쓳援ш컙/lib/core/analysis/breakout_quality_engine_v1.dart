import '../models/fu_state.dart';

class BreakoutQualityV1 {
  final String labelKo; // 돌파좋음/애매/실패/해당없음
  final int score; // 0~100
  final String reason;
  const BreakoutQualityV1({required this.labelKo, required this.score, required this.reason});
}

/// 돌파 품질(마감 기반) 간단 판정
/// - breakLevel 주변에서 종가가 어디에 닫혔는지
/// - 구조 태그(BOS/CHOCH/RANGE)와 함께 설명용으로 사용
class BreakoutQualityEngineV1 {
  const BreakoutQualityEngineV1();

  /// FuEngine 호환용(정적 호출)
  /// - breakLevel은 (vwap 기준으로) 가까운 SR을 임시 사용
  static BreakoutQualityV1 eval(
    List<FuCandle> candles, {
    required double s1,
    required double r1,
    required double vwap,
  }) {
    if (candles.isEmpty) {
      return const BreakoutQualityV1(labelKo: '대기', score: 0, reason: '캔들 데이터 없음');
    }
    final close = candles.last.close;
    // 가까운 기준선 선택(초보용 단순)
    double bl = 0;
    if (s1 > 0 && r1 > 0) {
      final ds = (close - s1).abs();
      final dr = (close - r1).abs();
      bl = (ds <= dr) ? s1 : r1;
    } else if (s1 > 0) {
      bl = s1;
    } else if (r1 > 0) {
      bl = r1;
    }
    if (bl <= 0) {
      return const BreakoutQualityV1(labelKo: '해당없음', score: 0, reason: '기준선 없음');
    }

    final dist = (close - bl).abs();
    final atr = _atrStatic(candles, 14);
    final tol = (atr > 0 ? atr * 0.15 : (bl * 0.001));

    if (dist <= tol) {
      return const BreakoutQualityV1(labelKo: '애매', score: 45, reason: '기준선 근처 마감(확정 아님)');
    }
    if (close > bl) {
      final sc = 65 + ((dist / (atr > 0 ? atr : dist)).clamp(0.0, 1.0) * 25).round();
      return BreakoutQualityV1(labelKo: '돌파좋음', score: sc.clamp(0, 100), reason: '기준선 위 마감(유지 확인)');
    }
    final sc = 60 + ((dist / (atr > 0 ? atr : dist)).clamp(0.0, 1.0) * 20).round();
    return BreakoutQualityV1(labelKo: '돌파실패', score: sc.clamp(0, 100), reason: '기준선 아래 마감(되돌림 주의)');
  }

  BreakoutQualityV1 analyze(FuState s) {
    final bl = s.breakLevel;
    if (bl <= 0) {
      return const BreakoutQualityV1(labelKo: '해당없음', score: 0, reason: '돌파 기준값 없음');
    }
    final cs = s.candles;
    if (cs.isEmpty) {
      return const BreakoutQualityV1(labelKo: '대기', score: 0, reason: '캔들 데이터 없음');
    }
    final c = cs.last;
    final close = c.close;

    final dist = (close - bl).abs();
    final atr = _atr(cs, 14);
    final tol = (atr > 0 ? atr * 0.15 : (bl * 0.001)); // ATR 15% 또는 0.1%

    // 구조 방향 힌트
    final st = s.structureTag.toUpperCase();
    final isUpBias = st.contains('BOS') && !st.contains('DOWN');
    final isDownBias = st.contains('CHOCH') || st.contains('RANGE') ? false : false;

    // 간단: 위에서 마감 / 아래에서 마감 / 근처에서 마감
    if (dist <= tol) {
      return const BreakoutQualityV1(labelKo: '애매', score: 45, reason: '기준선 근처 마감(확정 아님)');
    }
    if (close > bl) {
      final sc = 65 + ((dist / (atr > 0 ? atr : dist)).clamp(0.0, 1.0) * 25).round();
      return BreakoutQualityV1(
        labelKo: '돌파좋음',
        score: sc.clamp(0, 100),
        reason: '기준선 위 마감(유지 확인)',
      );
    } else {
      final sc = 60 + ((dist / (atr > 0 ? atr : dist)).clamp(0.0, 1.0) * 20).round();
      return BreakoutQualityV1(
        labelKo: '돌파실패',
        score: sc.clamp(0, 100),
        reason: '기준선 아래 마감(되돌림 주의)',
      );
    }
  }

  double _atr(List<FuCandle> cs, int n) {
    if (cs.length < 2) return 0;
    final start = (cs.length - n).clamp(1, cs.length - 1);
    double sum = 0;
    int cnt = 0;
    for (int i = start; i < cs.length; i++) {
      final c = cs[i];
      final p = cs[i - 1].close;
      final tr = [
        (c.high - c.low).abs(),
        (c.high - p).abs(),
        (c.low - p).abs(),
      ].reduce((a, b) => a > b ? a : b);
      sum += tr;
      cnt++;
    }
    return cnt > 0 ? (sum / cnt) : 0;
  }

  static double _atrStatic(List<FuCandle> cs, int n) {
    if (cs.length < 2) return 0;
    final start = (cs.length - n).clamp(1, cs.length - 1);
    double sum = 0;
    int cnt = 0;
    for (int i = start; i < cs.length; i++) {
      final c = cs[i];
      final p = cs[i - 1].close;
      final tr = [
        (c.high - c.low).abs(),
        (c.high - p).abs(),
        (c.low - p).abs(),
      ].reduce((a, b) => a > b ? a : b);
      sum += tr;
      cnt++;
    }
    return cnt > 0 ? (sum / cnt) : 0;
  }
}
