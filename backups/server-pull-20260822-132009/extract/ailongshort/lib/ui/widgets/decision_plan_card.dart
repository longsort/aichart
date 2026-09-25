import 'package:flutter/material.dart';

import '../../core/analysis/entry_planner.dart';

/// (PATCH v1) 5% 리스??고정 ?�랜??"?�눈"?�로 보여주는 초경??카드
/// - ?�체?�면 차트/???�디???�버?�이�??�용 가??class DecisionPlanCard extends StatelessWidget {
  final bool isLong;
  final String title;
  final int probability;
  final EntryPlan plan;

  const DecisionPlanCard({
    super.key,
    required this.isLong,
    required this.title,
    required this.probability,
    required this.plan,
  });

  String _fmt(double v) {
    if (v.isNaN || v.isInfinite) return '--';
    if (v.abs() >= 1000) return v.toStringAsFixed(0);
    if (v.abs() >= 100) return v.toStringAsFixed(1);
    return v.toStringAsFixed(2);
  }

  @override
  Widget build(BuildContext context) {
    final dir = isLong ? 'LONG' : 'SHORT';
    return Container(
      padding: const EdgeInsets.fromLTRB(10, 10, 10, 10),
      decoration: BoxDecoration(
        color: const Color(0xFF0A0E15).withOpacity(0.92),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: Colors.white.withOpacity(0.12)),
        boxShadow: [
          BoxShadow(
            blurRadius: 14,
            spreadRadius: 0,
            offset: const Offset(0, 6),
            color: Colors.black.withOpacity(0.40),
          ),
        ],
      ),
      child: DefaultTextStyle(
        style: TextStyle(color: Colors.white.withOpacity(0.90), fontSize: 11, fontWeight: FontWeight.w800),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: (isLong ? const Color(0xFF00FF88) : const Color(0xFFFF5555)).withOpacity(0.50)),
                    color: (isLong ? const Color(0xFF00FF88) : const Color(0xFFFF5555)).withOpacity(0.12),
                  ),
                  child: Text('$dir · $probability%'),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(color: Colors.white.withOpacity(0.92), fontWeight: FontWeight.w900),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            _row('ENTRY', _fmt(plan.entry)),
            _row('SL', _fmt(plan.sl)),
            _row('TP', '${_fmt(plan.tp1)} / ${_fmt(plan.tp2)} / ${_fmt(plan.tp3)}'),
            const SizedBox(height: 6),
            _row('RR', '${_fmt(plan.rr1)} / ${_fmt(plan.rr2)} / ${_fmt(plan.rr3)}'),
            _row('LEV', '${_fmt(plan.leverageRec)}x'),
            _row('QTY', '${_fmt(plan.qtyBtc)} BTC'),
            _row('MARGIN', '${_fmt(plan.marginUsdt)} USDT'),
          ],
        ),
      ),
    );
  }

  Widget _row(String k, String v) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 2),
      child: Row(
        children: [
          SizedBox(
            width: 52,
            child: Text(k, style: TextStyle(color: Colors.white.withOpacity(0.65), fontWeight: FontWeight.w900)),
          ),
          const SizedBox(width: 6),
          Expanded(child: Text(v, style: const TextStyle(fontWeight: FontWeight.w900))),
        ],
      ),
    );
  }
}
