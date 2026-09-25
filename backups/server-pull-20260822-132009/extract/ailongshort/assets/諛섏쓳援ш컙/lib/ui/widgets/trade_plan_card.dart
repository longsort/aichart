
import 'package:flutter/material.dart';
import '../../../engine/models/briefing_output.dart';

class TradePlanCard extends StatelessWidget {
  final BriefingOutput? briefing;
  final double equity;
  const TradePlanCard({super.key, required this.briefing, required this.equity});

  BriefingScenario? _pickTop(BriefingOutput b) {
    if (b.scenarios.isEmpty) return null;
    final sorted = [...b.scenarios]..sort((a,b)=>b.prob.compareTo(a.prob));
    return sorted.first;
  }

  @override
  Widget build(BuildContext context) {
    final b = briefing;
    if (b == null) return const SizedBox.shrink();
    final top = _pickTop(b);
    if (top == null) return const SizedBox.shrink();

    final entry = top.entry;
    final sl = top.sl;
    final tp = top.tp;
    final rr = top.rr;
    final qty = top.positionSize;

    double? stopPct;
    double? lev;
    if (entry != null && sl != null && entry != 0) {
      stopPct = ((entry - sl).abs() / entry) * 100.0;
      if (qty != null && equity > 0) {
        lev = (qty * entry) / equity;
      }
    }

    String fmtD(double? v) => v == null ? '-' : v.toStringAsFixed(2);

    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: Colors.grey.shade800),
        color: Colors.black.withOpacity(0.12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(top.name, style: const TextStyle(fontWeight: FontWeight.w800)),
          const SizedBox(height: 6),
          Wrap(
            spacing: 10,
            runSpacing: 6,
            children: [
              _chip('Entry', fmtD(entry)),
              _chip('SL', fmtD(sl)),
              _chip('TP', fmtD(tp)),
              _chip('RR', rr == null ? '-' : rr.toStringAsFixed(2)),
              _chip('Stop%', stopPct == null ? '-' : '${stopPct.toStringAsFixed(2)}%'),
              _chip('Qty', qty == null ? '-' : qty.toStringAsFixed(4)),
              _chip('Lev', lev == null ? '-' : '${lev.toStringAsFixed(2)}x'),
              _chip('Prob', '${top.prob}%'),
            ],
          ),
          const SizedBox(height: 8),
          Text(top.condition, maxLines: 2, overflow: TextOverflow.ellipsis, style: TextStyle(color: Colors.grey.shade400)),
          if (b.lockReason != null) ...[
            const SizedBox(height: 8),
            Text('LOCK: ${b.lockReason}', style: TextStyle(color: Theme.of(context).colorScheme.error, fontWeight: FontWeight.w700)),
          ],
        ],
      ),
    );
  }

  Widget _chip(String k, String v) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: Colors.grey.shade800),
      ),
      child: Text('$k $v', style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 12)),
    );
  }
}
