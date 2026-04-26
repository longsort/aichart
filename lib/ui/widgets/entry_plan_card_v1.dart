
import 'package:flutter/material.dart';
import '../../core/analysis/entry_planner.dart';
import 'neon_theme.dart';

class EntryPlanCardV1 extends StatelessWidget {
  final EntryPlan p;
  final bool isLong;
  const EntryPlanCardV1({super.key, required this.p, required this.isLong});

  String f(double v, {int d=1}) => v.isNaN || v.isInfinite ? '--' : v.toStringAsFixed(d);

  @override
  Widget build(BuildContext context) {
    final t = NeonTheme.of(context);
    final side = isLong ? 'Î°?Ï§ÄÎπ? : '??Ï§ÄÎπ?;
    final sideCol = isLong ? t.good : t.bad;

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: t.card,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: t.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text('ÏßÑÏûÖ ?åÎûú(v3)', style: TextStyle(color: t.fg, fontWeight: FontWeight.w900)),
              const Spacer(),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                decoration: BoxDecoration(
                  color: sideCol.withOpacity(0.15),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: sideCol.withOpacity(0.35)),
                ),
                child: Text(side, style: TextStyle(color: sideCol, fontWeight: FontWeight.w900, fontSize: 12)),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(child: _kv(t, 'ENTRY', f(p.entry), t.fg)),
              const SizedBox(width: 8),
              Expanded(child: _kv(t, 'SL', f(p.sl), t.bad)),
              const SizedBox(width: 8),
              Expanded(child: _kv(t, 'TP1', f(p.tp1), t.good)),
            ],
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(child: _kv(t, 'TP2', f(p.tp2), t.good)),
              const SizedBox(width: 8),
              Expanded(child: _kv(t, 'TP3', f(p.tp3), t.good)),
              const SizedBox(width: 8),
              Expanded(child: _kv(t, 'RR(ÏµúÎ?)', f(p.rr3, d:2), t.warn)),
            ],
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(child: _kv(t, 'Ï∂îÏ≤ú ?àÎ≤ÑÎ¶¨Ï?', '${f(p.leverageRec, d:0)}x', t.warn)),
              const SizedBox(width: 8),
              Expanded(child: _kv(t, '?¨Ï???BTC)', f(p.qtyBtc, d:4), t.fg)),
              const SizedBox(width: 8),
              Expanded(child: _kv(t, 'Ï¶ùÍ±∞Í∏?USDT)', f(p.marginUsdt, d:2), t.fg)),
            ],
          ),
          const SizedBox(height: 8),
          Text('??5% Î¶¨Ïä§??Í∏∞Ï?(Ï¥àÎ≥¥??. ?§Ï†ú ?òÏàòÎ£??¨Î¶¨?ºÏ???Î∞òÏòÅ ??',
              style: TextStyle(color: t.muted, fontSize: 11)),
        ],
      ),
    );
  }

  Widget _kv(NeonTheme t, String k, String v, Color vc) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
      decoration: BoxDecoration(
        color: t.bg,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: t.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(k, style: TextStyle(color: t.muted, fontSize: 11, fontWeight: FontWeight.w900)),
          const SizedBox(height: 6),
          Text(v, style: TextStyle(color: vc, fontSize: 13, fontWeight: FontWeight.w900)),
        ],
      ),
    );
  }
}
