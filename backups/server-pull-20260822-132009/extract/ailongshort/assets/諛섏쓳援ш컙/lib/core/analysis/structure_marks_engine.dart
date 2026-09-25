import '../../data/models/candle.dart';

class StructureMark {
  final int index; // candle index in provided list
  final double price; // y anchor
  final String tag; // BOS/CHOCH/MSB/EQH/EQL
  final bool isBull; // for small visual polarity
  const StructureMark({
    required this.index,
    required this.price,
    required this.tag,
    required this.isBull,
  });
}

/// 초보용/미니멀 구조 마크 엔진
/// - 목표: 차트가 지저분해지지 않게, 핵심 구조 태그만 적은 개수로 찍는다.
/// - BOS/CHOCH/MSB + EQH/EQL
class StructureMarksEngine {
  /// 최근 candles에 대해 구조 마크를 생성한다.
  /// [maxMarks]를 넘으면 최신 마크부터 남긴다.
  static List<StructureMark> build(
    List<Candle> candles, {
    int swingLeftRight = 2,
    int maxMarks = 10,
  }) {
    final n = candles.length;
    if (n < (swingLeftRight * 2 + 5)) return const [];

    // price range 기반 tolerance (EQH/EQL)
    double lo = candles.first.l, hi = candles.first.h;
    for (final c in candles) {
      if (c.l < lo) lo = c.l;
      if (c.h > hi) hi = c.h;
    }
    final span = (hi - lo).abs();
    final tol = (span * 0.002).clamp(hi * 0.0006, hi * 0.003); // 0.06%~0.3%

    int? lastSwingHighIdx;
    double? lastSwingHighPrice;
    int? lastSwingLowIdx;
    double? lastSwingLowPrice;

    // EQH/EQL 비교용(직전 스윙값)
    double? prevSwingHighPrice;
    double? prevSwingLowPrice;

    int trend = 0; // 1 bull, -1 bear, 0 unknown
    bool pendingFlip = false; // CHOCH 이후 첫 BOS를 MSB로 태그

    final marks = <StructureMark>[];

    bool isSwingHigh(int i) {
      final p = candles[i].h;
      for (int k = 1; k <= swingLeftRight; k++) {
        if (candles[i - k].h >= p) return false;
        if (candles[i + k].h > p) return false;
      }
      return true;
    }

    bool isSwingLow(int i) {
      final p = candles[i].l;
      for (int k = 1; k <= swingLeftRight; k++) {
        if (candles[i - k].l <= p) return false;
        if (candles[i + k].l < p) return false;
      }
      return true;
    }

    // 1) swing 스캔 + EQH/EQL
    for (int i = swingLeftRight; i < n - swingLeftRight; i++) {
      if (isSwingHigh(i)) {
        lastSwingHighIdx = i;
        lastSwingHighPrice = candles[i].h;

        if (prevSwingHighPrice != null &&
            (candles[i].h - prevSwingHighPrice!).abs() <= tol) {
          marks.add(StructureMark(index: i, price: candles[i].h, tag: 'EQH', isBull: false));
        }
        prevSwingHighPrice = candles[i].h;
      }
      if (isSwingLow(i)) {
        lastSwingLowIdx = i;
        lastSwingLowPrice = candles[i].l;

        if (prevSwingLowPrice != null &&
            (candles[i].l - prevSwingLowPrice!).abs() <= tol) {
          marks.add(StructureMark(index: i, price: candles[i].l, tag: 'EQL', isBull: true));
        }
        prevSwingLowPrice = candles[i].l;
      }

      // 2) BOS/CHOCH/MSB는 "마감" 기준으로 최근 몇 개에서만 의미가 큼.
      //    Swing가 잡힌 이후의 캔들에서 close가 swing을 돌파하면 이벤트 발생.
      final close = candles[i].c;
      if (lastSwingHighIdx != null && lastSwingHighPrice != null && i > lastSwingHighIdx!) {
        if (close > lastSwingHighPrice!) {
          if (trend >= 0) {
            // 추세 유지 BOS 또는 MSB(CHOCH 이후 첫 BOS)
            marks.add(StructureMark(
              index: i,
              price: lastSwingHighPrice!,
              tag: pendingFlip ? 'MSB' : 'BOS',
              isBull: true,
            ));
            trend = 1;
            pendingFlip = false;
          } else {
            // 반대 추세에서 상방 돌파 = CHOCH
            marks.add(StructureMark(index: i, price: lastSwingHighPrice!, tag: 'CHOCH', isBull: true));
            trend = 1;
            pendingFlip = true;
          }
          // 같은 스윙을 여러 번 찍는 것 방지: 돌파 후 스윙 초기화
          lastSwingHighIdx = null;
          lastSwingHighPrice = null;
        }
      }

      if (lastSwingLowIdx != null && lastSwingLowPrice != null && i > lastSwingLowIdx!) {
        if (close < lastSwingLowPrice!) {
          if (trend <= 0) {
            marks.add(StructureMark(
              index: i,
              price: lastSwingLowPrice!,
              tag: pendingFlip ? 'MSB' : 'BOS',
              isBull: false,
            ));
            trend = -1;
            pendingFlip = false;
          } else {
            marks.add(StructureMark(index: i, price: lastSwingLowPrice!, tag: 'CHOCH', isBull: false));
            trend = -1;
            pendingFlip = true;
          }
          lastSwingLowIdx = null;
          lastSwingLowPrice = null;
        }
      }
    }

    if (marks.isEmpty) return const [];
    // 최신 maxMarks만 유지
    marks.sort((a, b) => a.index.compareTo(b.index));
    final trimmed = marks.length > maxMarks ? marks.sublist(marks.length - maxMarks) : marks;
    return List<StructureMark>.unmodifiable(trimmed);
  }
}