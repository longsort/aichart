import 'dart:math';
import '../models/candle.dart';
import '../models/decision.dart';
import '../models/plan.dart';
import '../models/ultra_result.dart';

class UltraEngine {
  /// 초보 보호 3번 모드:
  /// 위험하면 "하지 마라(잠금)"을 우선.
  static UltraResult analyze({
    required double lastPrice,
    required List<Candle> candles,
  }) {
    if (candles.length < 30) {
      return UltraResult(
        decision: const UiDecision(
          title: '지금 추천: ❌ 하지 마세요(잠금)',
          detail: '데이터가 부족해서 판단이 불안정합니다. 캔들이 더 쌓일 때까지 기다리세요.',
          locked: true,
          confidence: 55,
        ),
        evidence: const EvidenceScore(
          flow: 40,
          shape: 35,
          bigHand: 30,
          crowding: 35,
          risk: 75,
        ),
        plan: null,
        coreScore: 35,
        pulse: const [],
      );
    }

    // --- 기본 계산 ---
    final closes = candles.map((c) => c.close).toList();
    final returns = <double>[];
    for (int i = 1; i < closes.length; i++) {
      returns.add((closes[i] - closes[i - 1]) / closes[i - 1]);
    }

    double stdev(List<double> xs) {
      final m = xs.reduce((a, b) => a + b) / xs.length;
      final v = xs.map((x) => (x - m) * (x - m)).reduce((a, b) => a + b) / xs.length;
      return sqrt(v);
    }

    final vol = stdev(returns.take(60).toList()); // 최근 변동성
    final drift = (closes.last - closes[closes.length - 20]) / closes[closes.length - 20]; // 20봉 방향

    // 간단 파형(정규화)
    final pulse = closes.sublist(max(0, closes.length - 40));
    final minP = pulse.reduce(min);
    final maxP = pulse.reduce(max);
    final normPulse = maxP == minP
        ? List<double>.filled(pulse.length, 0.5)
        : pulse.map((p) => (p - minP) / (maxP - minP)).toList();

    // --- Evidence 점수(0~100) ---
    int clamp0_100(num v) => v.clamp(0, 100).toInt();

    final flowScore = clamp0_100((drift.abs() * 9000)); // 대충 0~90
    final shapeScore = clamp0_100(35 + (1 - (vol * 120)).clamp(0, 1) * 50);
    final bigHandScore = clamp0_100(30 + (vol * 220).clamp(0, 1) * 40);
    final crowdingScore = clamp0_100(30 + (vol * 260).clamp(0, 1) * 50);
    final riskScore = clamp0_100(30 + (vol * 350).clamp(0, 1) * 70);

    final evidence = EvidenceScore(
      flow: flowScore,
      shape: shapeScore,
      bigHand: bigHandScore,
      crowding: crowdingScore,
      risk: riskScore,
    );

    // --- 잠금 판단(초보 보호) ---
    final highRisk = riskScore >= 70;
    final noDirection = drift.abs() < 0.008; // 0.8% 미만이면 방향 약함
    final veryChoppy = vol >= 0.012; // 변동성 거칠다

    if (highRisk && (noDirection || veryChoppy)) {
      final conf = clamp0_100(65 + (riskScore - 70) * 1.2);
      return UltraResult(
        decision: UiDecision(
          title: '지금 추천: ❌ 하지 마세요(잠금)',
          detail: '이유: 흔들림이 크고 방향이 약합니다.\n해제 조건: 변동성이 줄거나(안정) 방향이 뚜렷해질 때.',
          locked: true,
          confidence: conf,
        ),
        evidence: evidence,
        plan: null,
        coreScore: clamp0_100(40 + flowScore * 0.25 - riskScore * 0.35),
        pulse: normPulse,
      );
    }

    // --- 설계(들어간다면) ---
    final range20 = candles.sublist(candles.length - 20).map((c) => c.high - c.low).toList();
    final avgRange = range20.reduce((a, b) => a + b) / range20.length;
    final dirUp = drift >= 0;

    final entry = lastPrice;
    final stop = dirUp ? (entry - avgRange * 1.2) : (entry + avgRange * 1.2);
    final target = dirUp ? (entry + avgRange * 2.0) : (entry - avgRange * 2.0);

    final core = clamp0_100(
      55 + (flowScore * 0.25) + (shapeScore * 0.15) - (riskScore * 0.35),
    );

    final conf = clamp0_100(60 + flowScore * 0.25 - riskScore * 0.15);

    final title = dirUp ? '지금 추천: ✅ 조심해서 상승 쪽(소액)' : '지금 추천: ✅ 조심해서 하락 쪽(소액)';
    final detail = '이유: 방향이 조금 보이고(흐름), 위험이 잠금 수준은 아닙니다.\n주의: 초보는 무리 금지(소액/짧게).';

    return UltraResult(
      decision: UiDecision(title: title, detail: detail, locked: false, confidence: conf),
      evidence: evidence,
      plan: Plan(entry: entry, stop: stop, target: target),
      coreScore: core,
      pulse: normPulse,
    );
  }
}