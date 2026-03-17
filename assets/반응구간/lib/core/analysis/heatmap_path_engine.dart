import 'dart:math' as math;

import '../models/fu_state.dart';
import '../../logic/flow_metrics.dart';

/// Heatmap → FuturePath (v1)
/// - TF×엔진 분해(0~100) + 지지/저항 확률(체감형) 산출
/// - UI(FutureWavePanel)에서 바로 쓰는 타입 제공
class FuFutureScenario {
  final String id; // MAIN / ALT / FAIL
  final bool isLong;
  final int prob; // 0~100
  final double? invalidLine;
  final double? targetLow;
  final double? targetHigh;
  final String note;

  const FuFutureScenario({
    required this.id,
    required this.isLong,
    required this.prob,
    this.invalidLine,
    this.targetLow,
    this.targetHigh,
    this.note = '',
  });
}

class HeatmapPathEngine {
  static int _clamp(int v) => v < 0 ? 0 : (v > 100 ? 100 : v);

  static int _dirScore(String dir, {required bool isLongBias}) {
    final d = dir.toUpperCase();
    if (d == 'LONG' || d == 'UP') return isLongBias ? 90 : 10;
    if (d == 'SHORT' || d == 'DOWN') return isLongBias ? 10 : 90;
    return 50;
  }

  static int _supportScore({
    required int dirV,
    required int strengthV,
    required int riskV,
    required int reactV,
    required int obV,
    required int tapeV,
    required int absorptionV,
    required bool isLongBias,
  }) {
    // “지지 가능성” = (방향 정합 + 강도 + 반응 + 오더북 + 테이프 + 흡수) + (리스크 양호) - (극단 치우침 패널티)
    double v = 0;
    v += dirV * 0.18;
    v += strengthV * 0.22;
    v += reactV * 0.12;
    v += (isLongBias ? obV : (100 - obV)) * 0.18;
    v += (isLongBias ? tapeV : (100 - tapeV)) * 0.18;
    v += absorptionV * 0.08;
    v += riskV * 0.04;

    // 과도 치우침은 스탑헌트/유인 가능성 → 소폭 패널티
    final extreme = (math.max(obV, 100 - obV) - 70).clamp(0, 30);
    v -= extreme * 0.25;

    return _clamp(v.round());
  }

  /// TF×Evidence matrix (0~100)
  /// - TF: mtfPulse keys (ex: 5m/15m/1h/4h/1D/1W/1M)
  /// - Evidence: dir,strength,risk,reaction,ob,tape,absorb,support
  static Map<String, Map<String, int>> buildTfMatrix({
    required Map<String, FuTfPulse> pulses,
    required FlowSnapshot flow,
    required bool isLongBias,
  }) {
    final out = <String, Map<String, int>>{};
    for (final e in pulses.entries) {
      final tf = e.key;
      final p = e.value;

      final dirV = _dirScore(p.dir, isLongBias: isLongBias);
      final strengthV = _clamp(p.strength);
      final riskV = _clamp(100 - p.risk); // 낮을수록 좋음 → 뒤집기
      final reactV = p.inReaction ? 90 : 25;

      // flow는 TF별로 달리 못 받으면 동일 값 복제(현실적 타협)
      final obV = _clamp(flow.obImbalance);
      final tapeV = _clamp(flow.buyStrength);
      final absorbV = _clamp(flow.absorption);

      final supportV = _supportScore(
        dirV: dirV,
        strengthV: strengthV,
        riskV: riskV,
        reactV: reactV,
        obV: obV,
        tapeV: tapeV,
        absorptionV: absorbV,
        isLongBias: isLongBias,
      );

      out[tf] = <String, int>{
        'dir': dirV,
        'strength': strengthV,
        'risk': riskV,
        'reaction': reactV,
        'ob': obV,
        'tape': tapeV,
        'absorb': absorbV,
        'support': supportV,
      };
    }
    return out;
  }

  /// 3-way future path (MAIN/ALT/FAIL)
  static List<FuFutureScenario> buildScenarios({
    required bool isLongBias,
    required double last,
    required double reactLow,
    required double reactHigh,
    required FlowSnapshot flow,
    required Map<String, FuTfPulse> pulses,
  }) {
    final matrix = buildTfMatrix(pulses: pulses, flow: flow, isLongBias: isLongBias);

    // TF 가중치: 분 < 시간 < 일 < 주 < 달
    int tfW(String tf) {
      final s = tf.toLowerCase();
      if (s.contains('m') && !s.contains('1m')) return 1; // 5m/15m/30m
      if (s.contains('h')) return 2;
      if (s.contains('1d') || s == 'd') return 3;
      if (s.contains('1w') || s == 'w') return 4;
      if (s.contains('1m') || s.contains('month')) return 5;
      return 2;
    }

    double aggSupport = 0, aggStrength = 0, aggRiskGood = 0, wSum = 0;
    for (final e in matrix.entries) {
      final w = tfW(e.key).toDouble();
      final m = e.value;
      aggSupport += (m['support'] ?? 50) * w;
      aggStrength += (m['strength'] ?? 50) * w;
      aggRiskGood += (m['risk'] ?? 50) * w;
      wSum += w;
    }

    final support = wSum <= 0 ? 50 : (aggSupport / wSum);
    final strength = wSum <= 0 ? 50 : (aggStrength / wSum);
    final riskGood = wSum <= 0 ? 50 : (aggRiskGood / wSum);

    final flowBias = isLongBias
        ? (flow.buyStrength * 0.60 + flow.obImbalance * 0.40)
        : ((100 - flow.buyStrength) * 0.60 + (100 - flow.obImbalance) * 0.40);

    final mainProb = _clamp((support * 0.46 + strength * 0.24 + riskGood * 0.10 + flowBias * 0.20).round());
    final altProb = _clamp((mainProb * 0.55 + flow.absorption * 0.35 + math.min(20, (100 - mainProb)) * 0.10).round());
    final failProb = _clamp((100 - mainProb) + ((100 - flow.absorption) * 0.15).round());

    final range = (reactHigh - reactLow).abs();
    final invalid = isLongBias ? reactLow : reactHigh;

    // 보수적 목표: 반응구간 밖으로 1.6R
    final tMain1 = isLongBias ? math.max(last, reactHigh) : math.min(last, reactLow);
    final tMain2 = isLongBias ? (reactHigh + range * 1.6) : (reactLow - range * 1.6);

    return <FuFutureScenario>[
      FuFutureScenario(
        id: 'MAIN',
        isLong: isLongBias,
        prob: mainProb,
        invalidLine: invalid,
        targetLow: isLongBias ? tMain1 : tMain2,
        targetHigh: isLongBias ? tMain2 : tMain1,
        note: '방어 성공(주)',
      ),
      FuFutureScenario(
        id: 'ALT',
        isLong: isLongBias,
        prob: altProb,
        invalidLine: isLongBias ? (reactLow - range * 0.25) : (reactHigh + range * 0.25),
        targetLow: isLongBias ? tMain1 : tMain2,
        targetHigh: isLongBias ? tMain2 : tMain1,
        note: '스탑털고 반전(대체)',
      ),
      FuFutureScenario(
        id: 'FAIL',
        isLong: !isLongBias,
        prob: failProb,
        invalidLine: isLongBias ? reactHigh : reactLow,
        targetLow: isLongBias ? (reactLow - range * 1.2) : (reactHigh + range * 1.2),
        targetHigh: isLongBias ? reactLow : reactHigh,
        note: '방어 실패(반대)',
      ),
    ];
  }
}
