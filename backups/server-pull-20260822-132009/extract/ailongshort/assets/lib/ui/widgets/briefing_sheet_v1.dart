import 'package:flutter/material.dart';
import '../../core/models/fu_state.dart';
import 'briefing_cards.dart';

class BriefingSheetV1 extends StatelessWidget {
  final String tf;
  final FuState s;
  const BriefingSheetV1({super.key, required this.tf, required this.s});

  @override
  Widget build(BuildContext context) {
    final safeTop = MediaQuery.of(context).padding.top;
    final h = MediaQuery.of(context).size.height;
    return Container(
      height: h * 0.72,
      padding: EdgeInsets.fromLTRB(14, 12 + safeTop * 0.0, 14, 14),
      decoration: BoxDecoration(
        color: const Color(0xFF0B0D12),
        borderRadius: const BorderRadius.vertical(top: Radius.circular(22)),
        border: Border.all(color: Colors.white.withOpacity(0.08)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text('$tf 마감 브리핑', style: const TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.w900)),
              const Spacer(),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                decoration: BoxDecoration(
                  color: Colors.white.withOpacity(0.06),
                  borderRadius: BorderRadius.circular(999),
                  border: Border.all(color: Colors.white.withOpacity(0.08)),
                ),
                child: Text('${s.price.toStringAsFixed(0)}', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w900)),
              ),
            ],
          ),
          const SizedBox(height: 10),
          BriefingCardJudge(title: '판결', value: BriefingHelpers.judgeFrom(s)),
          const SizedBox(height: 6),
          BriefingCardConfidence(confidence: s.confidence, evidenceHit: s.evidenceHit, evidenceTotal: s.evidenceTotal),
          const SizedBox(height: 6),
          BriefingCardRisk(riskPct: s.risk),
          const SizedBox(height: 10),
          BriefingCardNextCandle(hintText: BriefingHelpers.nextCandleHintFrom(s)),
          const SizedBox(height: 10),
          BriefingCardPrices(
            vwap: s.vwap,
            s1: s.s1,
            r1: s.r1,
            zoneValid: s.zoneValid,
            zoneInvalid: s.zoneInvalid,
            zoneTargets: s.zoneTargets,
          ),
          const Spacer(),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('닫기'),
            ),
          ),
        ],
      ),
    );
  }
}
