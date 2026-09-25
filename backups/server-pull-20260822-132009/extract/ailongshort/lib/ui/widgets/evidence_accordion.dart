
import 'package:flutter/material.dart';
import '../../../engine/models/briefing_output.dart';

class EvidenceAccordion extends StatelessWidget {
  final BriefingOutput? briefing;
  const EvidenceAccordion({super.key, required this.briefing});

  @override
  Widget build(BuildContext context) {
    final b = briefing;
    if (b == null) return const SizedBox.shrink();
    final items = b.evidenceBullets;
    if (items.isEmpty) return const SizedBox.shrink();

    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: Colors.grey.shade800),
        color: Colors.black.withOpacity(0.10),
      ),
      child: ExpansionTile(
        tilePadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        childrenPadding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
        title: const Text('근거', style: TextStyle(fontWeight: FontWeight.w800)),
        children: [
          for (final s in items)
            Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('??', style: TextStyle(fontWeight: FontWeight.w900)),
                  Expanded(child: Text(s, style: TextStyle(color: Colors.grey.shade300))),
                ],
              ),
            ),
        ],
      ),
    );
  }
}
