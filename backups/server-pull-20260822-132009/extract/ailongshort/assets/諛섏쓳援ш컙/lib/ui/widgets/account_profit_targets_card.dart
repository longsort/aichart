import 'dart:math';

import 'package:flutter/material.dart';
import 'package:fulink_pro_ultra/engine/paper/trade_cost_model.dart';
import 'package:fulink_pro_ultra/engine/paper/paper_trade_engine.dart';
import 'package:fulink_pro_ultra/engine/risk/risk_sizing.dart';

class AccountProfitTargetsCard extends StatelessWidget {
  final double balance; // (미사용) 과거 계좌기준 호환용

  final double entry;
  final double sl;
  final List<double> tps;
  final List<double> prices;


  const AccountProfitTargetsCard({
    super.key,
    required this.balance,
    required this.entry,
    required this.sl,
    required this.tps,
    required this.prices,
  });

double _atrPct(List<double> prices) {
  // ATR% 근사: 최근 N개 가격의 평균 절대변화율(%) 사용 (OHLC 없을 때 안정적인 대안)
  final n = prices.length;
  if (n < 5) return 0.0;
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
  return (sum / cnt).clamp(0.0, 0.50); // 0~50%
}

  @override
  Widget build(BuildContext context) {
    if (tps.isEmpty || entry <= 0) return const SizedBox.shrink();

    final s = RiskSizing.size(balance: balance, entry: entry, sl: sl);
    final qty = (s['qty'] ?? 0.0) as double;
    final lev = (s['leverage'] ?? 1) as int;

    final sizeUsd = qty * entry; // notional
    const feePct = 0.0010; // 왕복 수수료(보수적)

    List<_Line> lines = [];
    for (int i = 0; i < tps.length && i < 3; i++) {
      final tp = tps[i];
      final movePct = ((tp - entry).abs() / entry).clamp(0.0, 1.0);
      final roePct = (movePct * lev - feePct); // 매매 기준 수익률(ROE)
      final pnlPct = roePct;

      lines.add(_Line(
        label: '목표${i + 1}',
        price: tp,
        pnlPct: pnlPct,
      ));
    }

    final tp1 = lines.isNotEmpty ? lines[0].pnlPct : 0.0;

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.06),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.white.withOpacity(0.10)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('목표 수익(매매 기준, 예상)',
              style: TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.bold)),
          const SizedBox(height: 6),
          Text('기준: 시드 5% 손실 + 레버리지 자동 계산 + 수수료 포함',
              style: TextStyle(color: Colors.white54, fontSize: 11)),
          const SizedBox(height: 10),
          ...lines.map((e) => _row(e)),
          const SizedBox(height: 8),
          const SizedBox(height: 8),
          Text(_hint(tp1),
              style: TextStyle(color: Colors.white.withOpacity(0.65), fontSize: 11, fontWeight: FontWeight.bold)),
        ],
      ),
    );
  }

  Widget _row(_Line e) {
    final pct = (e.pnlPct * 100);
    final tag = _tag(pct);

    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Row(
        children: [
          SizedBox(width: 60, child: Text(e.label, style: const TextStyle(color: Colors.white70, fontSize: 12))),
          Expanded(
            child: Text('${e.price.toStringAsFixed(2)}',
                style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.bold)),
          ),
          Text('${pct.toStringAsFixed(1)}%',
              style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.bold)),
          const SizedBox(width: 8),
          Text(tag, style: const TextStyle(color: Colors.white54, fontSize: 11)),
        ],
      ),
    );
  }

  String _tag(double pct) {
    if (pct >= 30) return '강';
    if (pct >= 20) return '좋음';
    if (pct >= 10) return '가능';
    if (pct > 0) return '작음';
    return '위험';
  }

  String _hint(double tp1Pct01) {
    final p = tp1Pct01 * 100;
    if (p >= 10 && p <= 30) {
      return '✅ 목표1이 “현실적(10~30%)” 구간입니다.';
    }
    if (p < 10 && p > 0) {
      return '⚠️ 목표1 수익이 10% 미만입니다. (수수료/슬리피지 고려) 목표2까지 봐도 됩니다.';
    }
    if (p > 30) {
      return '⚠️ 목표1 수익이 30% 초과입니다. 너무 욕심이면 목표를 낮춰도 됩니다.';
    }
    return '⚠️ 수익/위험 계산이 비정상입니다. 진입/손절 값을 확인하세요.';
  }
}

class _Line {
  final String label;
  final double price;
  final double pnlPct;

  _Line({
    required this.label,
    required this.price,
    required this.pnlPct,
  });
}