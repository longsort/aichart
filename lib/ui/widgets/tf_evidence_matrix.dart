// lib/ui/widgets/tf_evidence_matrix.dart
import 'package:flutter/material.dart';
import 'package:ailongshort/models/ultra_result.dart';
import 'package:ailongshort/logic/tf_consensus.dart';

class TfEvidenceMatrix extends StatelessWidget {
  final Map<String, UltraResult> tfResults; // key: '5m','15m','1H','4H','1D'
  const TfEvidenceMatrix({super.key, required this.tfResults});

  @override
  Widget build(BuildContext context) {
    final rows = <TfConsensusRow>[];
    for (final e in tfResults.entries) {
      rows.add(TfConsensusRow(tf: e.key, r: e.value));
    }
    rows.sort((a, b) => _tfOrder(a.tf).compareTo(_tfOrder(b.tf)));

    if (rows.isEmpty) return const SizedBox.shrink();

    final agree = TfConsensus.agreeCount(rows);
    final maj = TfConsensus.majorityDir(rows);
    final ok = TfConsensus.confirm(rows);

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: Colors.white.withOpacity(0.10)),
        color: Colors.white.withOpacity(0.03),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Text('TF√ó5Evidence ?©Ïùò Îß§Ìä∏Î¶?ä§', style: TextStyle(fontWeight: FontWeight.w800)),
              const Spacer(),
              Text('?©Ïùò: $agree/5  |  Î∞©Ìñ•: $maj', style: const TextStyle(fontSize: 12, color: Colors.white70)),
              const SizedBox(width: 10),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(999),
                  border: Border.all(color: ok ? Colors.greenAccent.withOpacity(0.7) : Colors.orangeAccent.withOpacity(0.6)),
                  color: ok ? Colors.greenAccent.withOpacity(0.10) : Colors.orangeAccent.withOpacity(0.08),
                ),
                child: Text(ok ? '?ïÏ†ï Í∞Ä?? : '?ïÏ†ï Í∏àÏ?', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w800)),
              ),
            ],
          ),
          const SizedBox(height: 10),
          ...rows.map(_row).toList(),
          const SizedBox(height: 6),
          const Text(
            'Í∏∞Ï?: Flow/Shape/BigHand/Crowding??0, Risk??5 ??5/5 + Î©Ä?∞TF ?©Ïùò 3/5 ?¥ÏÉÅ',
            style: TextStyle(fontSize: 11, color: Colors.white54),
          ),
        ],
      ),
    );
  }

  Widget _row(TfConsensusRow row) {
    final e = row.r.evidence;

    final chips = <_Chip>[
      _Chip('F', e.flow),
      _Chip('S', e.shape),
      _Chip('B', e.bigHand),
      _Chip('C', e.crowding),
      _Chip('R', 100 - e.risk), // risk ??ùÑ?òÎ°ù Ï¢ãÏúº???§Ïßë???úÏãú
    ];

    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Row(
        children: [
          SizedBox(width: 44, child: Text(row.tf, style: const TextStyle(fontWeight: FontWeight.w700))),
          SizedBox(width: 62, child: Text(row.dir, style: const TextStyle(fontSize: 12, color: Colors.white70))),
          SizedBox(width: 56, child: Text('hit ${row.hit5}/5', style: const TextStyle(fontSize: 12, color: Colors.white70))),
          Expanded(
            child: Wrap(
              spacing: 6,
              runSpacing: 6,
              children: chips.map(_chipBox).toList(),
            ),
          ),
          const SizedBox(width: 8),
          SizedBox(width: 46, child: Text('${row.r.coreScore}', textAlign: TextAlign.right)),
        ],
      ),
    );
  }

  Widget _chipBox(_Chip c) {
    final good = c.score >= 60;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: (good ? Colors.greenAccent : Colors.white).withOpacity(0.25)),
        color: (good ? Colors.greenAccent : Colors.white).withOpacity(0.06),
      ),
      child: Text('${c.k} ${c.score}', style: const TextStyle(fontSize: 11)),
    );
  }

  int _tfOrder(String tf) {
    switch (tf) {
      case '5m':
        return 1;
      case '15m':
        return 2;
      case '1H':
        return 3;
      case '4H':
        return 4;
      case '1D':
        return 5;
      default:
        return 99;
    }
  }
}

class _Chip {
  final String k;
  final int score;
  _Chip(this.k, this.score);
}