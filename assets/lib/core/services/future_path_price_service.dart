import '../utils/ai_safe.dart';
import '../models/future_path_price_dto.dart';

/// STEP14: AI 미래경로 가격(Anchor/Target/Invalid) 생성기
/// - 구간(zoneLow/zoneHigh) 파악 후 파동 시작(anchor)~마무리(target)까지 경로를 구간 내에서 정확히 계산
/// - dto(Map)에 zoneLow/zoneHigh(reactLow/reactHigh) 있으면 파동이 구간을 벗어나지 않도록 wavePrices 보정
/// - 무효가는 구조 붕괴(스윙/CHOCH) 값이 있으면 우선 사용, 없으면 ATR 기반
class FuturePathPriceService {
  // A/B/C 모드 가중치(구조/유동성/패턴/변동성)
  static Map<String, int> weights(String mode) {
    switch (mode) {
      case 'A':
        return {'S': 40, 'L': 30, 'P': 20, 'V': 10};
      case 'C':
        return {'S': 20, 'L': 35, 'P': 35, 'V': 10};
      case 'B':
      default:
        return {'S': 30, 'L': 30, 'P': 30, 'V': 10};
    }
  }

  static FuturePathPriceDTO build({
    required String tf,
    required Map<String, dynamic> dto,
    required String mode, // 'A'/'B'/'C'/'AUTO' (AUTO는 외부에서 결정된 모드 전달)
  }) {
    final w = weights(mode);

    final zoneLow = AiSafe.asDouble(dto['zoneLow'] ?? dto['reactLow'], 0);
    final zoneHigh = AiSafe.asDouble(dto['zoneHigh'] ?? dto['reactHigh'], 0);
    final zoneValid = zoneLow > 0 && zoneHigh > 0 && zoneLow < zoneHigh;

    double anchor = AiSafe.asDouble(dto['price'] ?? dto['anchorPrice'], 0);
    final dir = AiSafe.asStr(dto['decisionDir'] ?? dto['dir'], 'WATCH');
    final isLong = dir.toUpperCase().contains('LONG') || AiSafe.asStr(dto['decision'],"").contains('매수');
    final conf = AiSafe.asInt(dto['confidence'], 55);

    // 파동 시작: 구간이 있으면 구간 내로 클램프(지지/저항 터치 후 출발)
    if (zoneValid) {
      if (isLong && anchor < zoneLow) anchor = zoneLow;
      if (!isLong && anchor > zoneHigh) anchor = zoneHigh;
    }

    // 구성요소 점수(0~100)
    final s = AiSafe.asInt(dto['structureScore'], 50);
    final l = AiSafe.asInt(dto['liquidityScore'] ?? dto['orderbookScore'], 50);
    final p = AiSafe.asInt(dto['patternScore'] ?? dto['patternSim'], 50);
    final v = AiSafe.asInt(dto['volScore'] ?? dto['volatilityScore'], 50);

    final mix = (s * w['S']! + l * w['L']! + p * w['P']! + v * w['V']!) / 100.0; // 0~100

    // ATR/폭 (dto 없으면 대충 0.6%)
    final atr = AiSafe.asDouble(dto['atr'] ?? dto['atrPct'], 0);
    final basePct = atr > 0 ? (atr > 2 ? atr / 100.0 : atr) : 0.006;

    // 목표 이동폭: basePct * (0.6~1.6) * (mix 보정)
    final mul = 0.6 + (mix / 100.0) * 1.0;
    final movePct = basePct * mul;

    double target = isLong ? anchor * (1.0 + movePct) : anchor * (1.0 - movePct);
    // 파동 마무리: 구간이 있으면 목표가 구간 방향으로 유지(롱이면 target >= zoneLow, 숏이면 target <= zoneHigh)
    if (zoneValid) {
      if (isLong && target < anchor) target = anchor + (anchor - zoneLow).abs() * 0.5;
      if (!isLong && target > anchor) target = anchor - (zoneHigh - anchor).abs() * 0.5;
    }

    // 무효가: 구조 값 우선(스윙 low/high)
    final inv = AiSafe.asDouble(dto['invalidation'] ?? dto['invalidPrice'], 0);
    double invalid = (inv > 0)
        ? inv
        : (isLong ? anchor * (1.0 - basePct * 0.9) : anchor * (1.0 + basePct * 0.9));
    if (zoneValid) {
      if (isLong && invalid > zoneLow) invalid = zoneLow * 0.998;
      if (!isLong && invalid < zoneHigh) invalid = zoneHigh * 1.002;
    }

    // RR: (목표-진입)/(진입-무효) 근사
    final risk = (anchor - invalid).abs().clamp(1e-9, 1e18);
    final reward = (target - anchor).abs();
    final rr = reward / risk;
    final rrX10 = (rr * 10).round().clamp(0, 999);

    // 확률: confidence + (mix-50)*0.4
    final pMain = (conf + ((mix - 50) * 0.4)).round().clamp(0, 100);

    // 5파동 가격: 파동 시작(anchor) → 마무리(target), 구간 내에서 정확히 경로 설정
    double w1 = isLong ? anchor + (target - anchor) * 0.45 : anchor - (anchor - target) * 0.45;
    double w2 = isLong ? anchor + (target - anchor) * 0.20 : anchor - (anchor - target) * 0.20;
    double w3 = isLong ? anchor + (target - anchor) * 0.75 : anchor - (anchor - target) * 0.75;
    double w4 = isLong ? anchor + (target - anchor) * 0.55 : anchor - (anchor - target) * 0.55;
    final w5 = target;

    // 구간 보정: 롱이면 풀백(w2,w4)은 지지(zoneLow) 위, 숏이면 풀백은 저항(zoneHigh) 아래
    if (zoneValid) {
      if (isLong) {
        w2 = w2 < zoneLow ? zoneLow : w2;
        w4 = w4 < zoneLow ? zoneLow : w4;
        w1 = w1 < anchor ? anchor : w1;
        w3 = w3 < w2 ? w2 : w3;
      } else {
        w2 = w2 > zoneHigh ? zoneHigh : w2;
        w4 = w4 > zoneHigh ? zoneHigh : w4;
        w1 = w1 > anchor ? anchor : w1;
        w3 = w3 > w2 ? w2 : w3;
      }
    }

    // 파동 시작 → 마무리 시간순: [anchor, w1, w2, w3, w4, target] (점선이 이 순서로 연결됨)
    final wavePrices = <double>[anchor, w1, w2, w3, w4, w5];

    return FuturePathPriceDTO(
      tf: tf,
      anchor: anchor,
      target: target,
      invalid: invalid,
      pMain: pMain,
      rrX10: rrX10,
      dir: isLong ? 'LONG' : 'SHORT',
      wavePrices: wavePrices,
    );
  }
}
