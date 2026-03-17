import 'dart:math';
import 'package:flutter/material.dart';
import 'package:fulink_pro_ultra/engine/paper/trade_cost_model.dart';
import 'package:fulink_pro_ultra/engine/paper/paper_trade_engine.dart';

/// v109: 초보용 '자동 진입/손절/목표가(ROE)' 카드
///
/// - 목표 ROE(매매 기준) 10/20/30%를 역산해서 목표가를 제시
/// - 비용(수수료/슬리피지/펀딩) 반영
/// - 변동성(ATR 근사) 대비 현실성 태그(의미없음/현실적/과대)
/// - 5% 리스크 기준으로 포지션 규모/권장 레버리지(안전)를 함께 표시
class AutoEntryPlanCardV109 extends StatelessWidget {
  final double balance;
  final String decision; // LONG/SHORT/관망
  final double entry;
  final double sl;
  final List<double> prices;
  final double leverage;

  const AutoEntryPlanCardV109({
    super.key,
    required this.balance,
    required this.decision,
    required this.entry,
    required this.sl,
    required this.prices,
    required this.leverage,
  });

  double _atrPct(List<double> prices) {
    // OHLC가 없을 때: 최근 가격의 평균 절대 변화율을 ATR% 근사로 사용
    final n = prices.length;
    if (n < 6) return 0.0;
    final N = 14;
    final start = (n - N).clamp(1, n - 1);
    double sum = 0.0;
    int cnt = 0;
    for (int i = start; i < n; i++) {
      final a = prices[i - 1];
      final b = prices[i];
      if (a == 0) continue;
      sum += ((b - a).abs() / a);
      cnt += 1;
    }
    if (cnt == 0) return 0.0;
    return (sum / cnt).clamp(0.0, 0.50);
  }

  @override
  Widget build(BuildContext context) {
    final d = decision.toUpperCase();
    if (d == '관망' || entry == 0 || sl == 0) {
      return _card(
        title: '자동 진입/손절/목표가',
        child: const Text('관망 상태입니다.', style: TextStyle(color: Colors.white70, fontSize: 12)),
      );
    }

    final isShort = d.contains('SHORT') || d.contains('하락');
    final m = TradeCostModel.I;

    final atrPct = _atrPct(prices);
    final holdH = PaperTradeEngine.I.holdHours;
    final effLev = m.effectiveLeverage(max(1.0, leverage));
    final costNotional = m.costPctOnNotional(holdHours: holdH);
    final costROE = m.costPctOnMargin(leverage: effLev, holdHours: holdH);

    // 5% 리스크 모델
    final riskMoney = max(0.0, balance) * 0.05;
    final slDist = (entry - sl).abs();
    final qty = slDist <= 0 ? 0.0 : (riskMoney / slDist);
    final notional = qty * entry;
    final levNeed = balance <= 0 ? 1.0 : (notional / max(1.0, balance));

    // 안전 레버리지: 필요 레버리지보다 살짝 낮게 (현물 모드면 1 고정)
    final safeLev = m.spotMode.value ? 1.0 : (levNeed * 0.9).clamp(1.0, 20.0);

    double needMove(double targetRoe) {
      // netROE = movePct*effLev - costROE  => movePct = (targetRoe + costROE)/effLev
      return ((targetRoe + costROE) / max(1.0, effLev)).clamp(0.0, 0.50);
    }

    final minMove = max(costNotional, atrPct * 0.5);

    final targets = <double>[0.10, 0.20, 0.30];
    final rows = targets.map((t) {
      final mv = needMove(t);
      final tp = isShort ? (entry * (1.0 - mv)) : (entry * (1.0 + mv));

      String tag;
      if (mv < minMove) {
        tag = '의미없음';
      } else if (atrPct > 0 && mv > atrPct * 2.0) {
        tag = '과대';
      } else {
        tag = '현실적';
      }

      return _row(title: '목표 ${(t * 100).toStringAsFixed(0)}% (ROE)', movePct: mv, tp: tp, tag: tag);
    }).toList();

    final modeLabel = m.spotMode.value ? '현물' : '선물';

    return _card(
      title: '자동 진입/손절/목표가 (v109)',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('모드: $modeLabel • 적용 레버리지 ${effLev.toStringAsFixed(1)}배 • 보유시간 ${holdH.toStringAsFixed(1)}h',
              style: const TextStyle(color: Colors.white54, fontSize: 10)),
          const SizedBox(height: 6),
          Text('진입: ${entry.toStringAsFixed(2)}   손절: ${sl.toStringAsFixed(2)}',
              style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.bold)),
          const SizedBox(height: 6),
          Text('5% 리스크 기준: 수량 ${qty.toStringAsFixed(4)}  • 포지션 ${notional.toStringAsFixed(0)}  • 필요레버리지 ${levNeed.toStringAsFixed(1)}배  • 권장(안전) ${safeLev.toStringAsFixed(1)}배',
              style: const TextStyle(color: Colors.white70, fontSize: 11)),
          const SizedBox(height: 8),
          ...rows,
          const SizedBox(height: 8),
          Text('변동성(ATR 근사): ${(atrPct * 100).toStringAsFixed(2)}% • 최소유효변동: ${(minMove * 100).toStringAsFixed(2)}% • 비용(ROE): ${(costROE * 100).toStringAsFixed(2)}%',
              style: const TextStyle(color: Colors.white54, fontSize: 10)),
        ],
      ),
    );
  }

  Widget _row({required String title, required double movePct, required double tp, required String tag}) {
    return Padding(
      padding: const EdgeInsets.only(top: 6),
      child: Row(
        children: [
          Expanded(
            child: Text(title, style: const TextStyle(color: Colors.white70, fontSize: 11, fontWeight: FontWeight.bold)),
          ),
          Text('${(movePct * 100).toStringAsFixed(2)}% → ${tp.toStringAsFixed(2)}',
              style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.bold)),
          const SizedBox(width: 8),
          Text(tag, style: const TextStyle(color: Colors.white54, fontSize: 10)),
        ],
      ),
    );
  }

  Widget _card({required String title, required Widget child}) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: const Color(0xFF101623),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.white12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: const TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.bold)),
          const SizedBox(height: 10),
          child,
        ],
      ),
    );
  }
}
