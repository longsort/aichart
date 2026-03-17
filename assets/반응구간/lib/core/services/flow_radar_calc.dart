import 'dart:math';

import '../models/fu_state.dart';

class FlowRadarMetrics {
  final int buyStrength;     // 매수 힘 (0~100)
  final int sellStrength;    // 매도 힘 (0~100)
  final int obImbalance;     // 호가 쏠림 (0~100)
  final int absorption;      // 흡수/방어 (0~100)
  final int instBias;        // 기관/세력 방향 (0~100)
  final int whaleScore;      // 고래 힘 (0~100)
  final int whaleBuyPct;     // 고래 매수비중 (0~100)
  final int sweepRisk;       // 스탑헌트/쓸림 위험 (0~100)

  final String note;         // 초보용 한글 설명 한줄

  const FlowRadarMetrics({
    required this.buyStrength,
    required this.sellStrength,
    required this.obImbalance,
    required this.absorption,
    required this.instBias,
    required this.whaleScore,
    required this.whaleBuyPct,
    required this.sweepRisk,
    required this.note,
  });
}

class FlowRadarCalc {
  /// ✅ “연동 안돼도” 움직이게 만드는 1차 버전(가격/캔들/지지저항 기반)
  /// - candles(최근 120개)에서 거래량 스파이크, 바디/꼬리 비율로 힘/흡수/고래 추정
  /// - s1/r1/vwap, score/confidence/risk, signalDir/prob로 방향/위험 보정
  static FlowRadarMetrics compute(FuState s) {
    final candles = s.candles;
    // 안전장치: 캔들이 없으면 “중립”으로
    if (candles.isEmpty) {
      return const FlowRadarMetrics(
        buyStrength: 50,
        sellStrength: 50,
        obImbalance: 50,
        absorption: 50,
        instBias: 50,
        whaleScore: 50,
        whaleBuyPct: 50,
        sweepRisk: 50,
        note: '데이터 부족: 캔들/거래량 수집 중',
      );
    }

    // ----- 유틸 -----
    int toPct(num v) => v.clamp(0, 100).round();
    double clamp01(double v) => v.clamp(0.0, 1.0);

    // ----- 최근 N개 기반 통계 -----
    final int n = min(60, candles.length);
    final recent = candles.sublist(candles.length - n);

    double avgVol = 0.0;
    for (final c in recent) {
      avgVol += (c.volume).abs();
    }
    avgVol = (avgVol / n).clamp(0.0000001, double.infinity);

    final last = candles.last;
    final lastBody = (last.close - last.open).abs();
    final lastRange = (last.high - last.low).abs().clamp(0.0000001, double.infinity);
    final lastUpperWick = (last.high - max(last.open, last.close)).abs();
    final lastLowerWick = (min(last.open, last.close) - last.low).abs();

    // 거래량 스파이크(고래/세력 힌트)
    final volRatio = (last.volume.abs() / avgVol).clamp(0.0, 50.0); // 1=평균, 2=2배...
    final volSpike01 = clamp01((volRatio - 1.0) / 3.0); // 1~4배 사이를 0~1로 매핑

    // 바디 방향 (상승/하락 힘)
    final isGreen = last.close >= last.open;
    final body01 = clamp01(lastBody / lastRange); // 바디가 길수록 힘 강함

    // VWAP 대비 위치(세력 방향 힌트)
    final vwap = s.vwap;
    final price = s.price;
    final vwapBias01 = (vwap > 0)
        ? clamp01(((price - vwap) / (vwap * 0.006)).clamp(-1.0, 1.0) * 0.5 + 0.5)
        : 0.5;

    // 지지/저항 근접(호가쏠림/스윕 위험)
    final s1 = s.s1;
    final r1 = s.r1;
    final range = (r1 - s1).abs().clamp(1.0, 1e18);
    final nearSupport01 = (s1 > 0) ? clamp01(1.0 - ((price - s1).abs() / range)) : 0.0;
    final nearResist01 = (r1 > 0) ? clamp01(1.0 - ((r1 - price).abs() / range)) : 0.0;

    // ----- 1) 매수/매도 힘 -----
    // 바디 강도 + (VWAP 위/아래) + 거래량 스파이크
    double buy01 = 0.50;
    buy01 += (isGreen ? 1 : -1) * (0.18 + 0.22 * body01);
    buy01 += (vwapBias01 - 0.5) * 0.40;
    buy01 += volSpike01 * 0.22;

    // 기존 판단 보정(신뢰/점수/확률)
    final conf01 = clamp01(s.confidence / 100.0);
    final score01 = clamp01(s.score / 100.0);
    final prob01 = clamp01(s.signalProb / 100.0);
    buy01 += (0.10 * conf01 + 0.08 * score01 + 0.06 * prob01) - 0.12;

    // signalDir 문자열 기반 보정
    final dirStr = s.signalDir.toString().toLowerCase();
    if (dirStr.contains('long')) buy01 += 0.08;
    if (dirStr.contains('short')) buy01 -= 0.08;

    buy01 = clamp01(buy01);
    final buyStrength = toPct(buy01 * 100);
    final sellStrength = 100 - buyStrength;

    // ----- 2) 오더북 불균형(프록시) -----
    // 지지 가까우면 매수벽(+) 가능성 / 저항 가까우면 매도벽(+) 가능성
    double ob01 = 0.50;
    ob01 += (nearSupport01 - nearResist01) * 0.55;
    ob01 += (buy01 - 0.5) * 0.25;
    ob01 = clamp01(ob01);
    final obImbalance = toPct(ob01 * 100);

    // ----- 3) 흡수/방어 -----
    // 꼬리가 길고(스윕 흔적) 거래량이 크면 “흡수” 가능성 상승
    final wick01 = clamp01((lastUpperWick + lastLowerWick) / lastRange);
    double absorption01 = 0.35;
    absorption01 += wick01 * 0.45;
    absorption01 += volSpike01 * 0.25;
    // 지지 근접에서 아래꼬리 길면 방어(흡수) 가산
    absorption01 += nearSupport01 * clamp01(lastLowerWick / lastRange) * 0.35;
    absorption01 -= nearResist01 * clamp01(lastUpperWick / lastRange) * 0.20;
    absorption01 = clamp01(absorption01);
    final absorption = toPct(absorption01 * 100);

    // ----- 4) 기관/세력 방향 -----
    // score/conf + vwapBias + buy힘 종합
    double inst01 = 0.50;
    inst01 += (score01 - 0.5) * 0.25;
    inst01 += (conf01 - 0.5) * 0.20;
    inst01 += (vwapBias01 - 0.5) * 0.35;
    inst01 += (buy01 - 0.5) * 0.25;
    inst01 = clamp01(inst01);
    final instBias = toPct(inst01 * 100);

    // ----- 5) 고래 점수/고래 매수비중 -----
    // 볼륨 스파이크 + 바디강도 + 방향일치
    double whale01 = 0.18 + volSpike01 * 0.65 + body01 * 0.12;
    whale01 += (buy01 - 0.5).abs() * 0.18; // 한쪽으로 쏠릴수록 “힘” 상승
    whale01 = clamp01(whale01);
    final whaleScore = toPct(whale01 * 100);

    double whaleBuy01 = 0.50;
    whaleBuy01 += (buy01 - 0.5) * (0.55 + 0.25 * volSpike01);
    whaleBuy01 = clamp01(whaleBuy01);
    final whaleBuyPct = toPct(whaleBuy01 * 100);

    // ----- 6) 스탑헌트/쓸림 위험 -----
    // risk + 꼬리 + SR 근접 + 볼륨 스파이크
    final risk01 = clamp01(s.risk / 100.0);
    double sweep01 = 0.12;
    sweep01 += risk01 * 0.35;
    sweep01 += wick01 * 0.30;
    sweep01 += (max(nearSupport01, nearResist01)) * 0.25;
    sweep01 += volSpike01 * 0.20;
    sweep01 = clamp01(sweep01);
    final sweepRisk = toPct(sweep01 * 100);

    // ----- 초보용 한줄 코멘트 -----
    final String trendKo = (buyStrength >= 55)
        ? '매수 우세'
        : (buyStrength <= 45 ? '매도 우세' : '힘 비슷');
    final String whaleKo = (whaleScore >= 70)
        ? '고래 강함'
        : (whaleScore >= 45 ? '고래 보통' : '고래 약함');
    final String riskKo = (sweepRisk >= 70)
        ? '쓸림주의'
        : (sweepRisk >= 45 ? '주의' : '안정');

    final note = '$trendKo · $whaleKo · $riskKo';

    return FlowRadarMetrics(
      buyStrength: buyStrength,
      sellStrength: sellStrength,
      obImbalance: obImbalance,
      absorption: absorption,
      instBias: instBias,
      whaleScore: whaleScore,
      whaleBuyPct: whaleBuyPct,
      sweepRisk: sweepRisk,
      note: note,
    );
  }
}