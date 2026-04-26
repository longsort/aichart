import 'package:flutter/material.dart';
import 'package:fulink_pro_ultra/engine/evidence/evidence_engine.dart';

/// Backward/forward compatible conclusion card.
/// - Accepts either `evidence: EvidenceResult`
/// - or `evidenceHit/evidenceTotal` (legacy callers)
class AIConclusionCard extends StatelessWidget {
  final String decision;
  final int confidence;

  final EvidenceResult? evidence;
  final int? evidenceHit;
  final int? evidenceTotal;

  final int up15;
  final int risk;
  final String whale;
  final int whaleStreak;

  const AIConclusionCard({
    super.key,
    required this.decision,
    required this.confidence,
    this.evidence,
    this.evidenceHit,
    this.evidenceTotal,
    required this.up15,
    required this.risk,
    required this.whale,
    required this.whaleStreak,
  });

  int get _hit => evidence?.hit ?? (evidenceHit ?? 0);
  int get _total => evidence?.total ?? (evidenceTotal ?? 10);

  @override
  Widget build(BuildContext context) {
    final d = decision.toUpperCase();
    final badge = d == '상승(LONG)' ? '상승(롱)' : (d == '하락(SHORT)' ? '하락(숏)' : '관망');
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
          Row(
            children: [
              _chip('AI $badge'),
              const SizedBox(width: 8),
              _chip('확신 $confidence%'),
              const Spacer(),
              _chip('근거 $_hit/$_total'),
            ],
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              _chip('15분상승 $up15%'),
              const SizedBox(width: 8),
              _chip('위험도 $risk'),
              const SizedBox(width: 8),
              _chip('고래 $whale'),
              const SizedBox(width: 8),
              _chip('연속 $whaleStreak'),
            ],
          ),
        ],
      ),
    );
  }

  Widget _chip(String t) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.08),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: Colors.white.withOpacity(0.12)),
      ),
      child: Text(t, style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.bold)),
    );
  }
}