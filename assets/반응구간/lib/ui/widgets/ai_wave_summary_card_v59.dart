import 'package:flutter/material.dart';
import 'neon_card.dart';

class AiWaveSummaryCardV59 extends StatelessWidget {
  final String headline;
  final int longPct;
  final int shortPct;
  final int noTradePct;
  final int confidence;
  final int risk;
  final int evidenceHit;
  final int evidenceTotal;
  final List<String> reasons;

  const AiWaveSummaryCardV59({
    super.key,
    required this.headline,
    required this.longPct,
    required this.shortPct,
    required this.noTradePct,
    required this.confidence,
    required this.risk,
    required this.evidenceHit,
    required this.evidenceTotal,
    required this.reasons,
  });

  @override
  Widget build(BuildContext context) {
    String pct(int v) => '${v.clamp(0, 100)}%';
    final rs = reasons.take(3).toList();

    return NeonCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(headline,
              style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w900)),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(child: _barRow('LONG', longPct)),
              const SizedBox(width: 10),
              Expanded(child: _barRow('SHORT', shortPct)),
              const SizedBox(width: 10),
              Expanded(child: _barRow('NO', noTradePct)),
            ],
          ),
          const SizedBox(height: 10),
          Wrap(
            spacing: 10,
            runSpacing: 6,
            children: [
              _chip('신뢰 $confidence'),
              _chip('위험 $risk'),
              _chip('근거 $evidenceHit/$evidenceTotal'),
            ],
          ),
          if (rs.isNotEmpty) ...[
            const SizedBox(height: 10),
            ...rs.map((e) => Padding(
                  padding: const EdgeInsets.only(bottom: 4),
                  child: Text('• $e',
                      style: TextStyle(
                          fontSize: 12,
                          color: Colors.white.withOpacity(0.85))),
                )),
          ],
        ],
      ),
    );
  }

  Widget _chip(String t) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.06),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: Colors.white.withOpacity(0.10)),
      ),
      child: Text(t,
          style: TextStyle(fontSize: 11, color: Colors.white.withOpacity(0.85))),
    );
  }

  Widget _barRow(String label, int v) {
    final vv = v.clamp(0, 100).toDouble();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Text(label,
                style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w800,
                    color: Colors.white.withOpacity(0.85))),
            const Spacer(),
            Text('${vv.toStringAsFixed(0)}%',
                style: TextStyle(fontSize: 11, color: Colors.white.withOpacity(0.80))),
          ],
        ),
        const SizedBox(height: 6),
        ClipRRect(
          borderRadius: BorderRadius.circular(10),
          child: LinearProgressIndicator(
            value: vv / 100.0,
            minHeight: 10,
            backgroundColor: Colors.white.withOpacity(0.08),
          ),
        ),
      ],
    );
  }
}
