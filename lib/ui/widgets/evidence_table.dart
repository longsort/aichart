import 'package:flutter/material.dart';
import '../../engine/models/evidence_matrix.dart';

/// S-13: 브리????근거 ?�수????EvidenceMatrix(TF×근거) + 총점
class EvidenceTable extends StatelessWidget {
  final EvidenceMatrix? matrix;

  const EvidenceTable({super.key, this.matrix});

  @override
  Widget build(BuildContext context) {
    if (matrix == null || matrix!.rows.isEmpty) {
      return const SizedBox.shrink();
    }
    final m = matrix!;
    return Container(
      padding: const EdgeInsets.all(12),
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      decoration: BoxDecoration(
        color: Colors.grey.shade900,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text('근거 ?�수??, style: Theme.of(context).textTheme.titleSmall),
          const SizedBox(height: 8),
          Table(
            columnWidths: const {0: FlexColumnWidth(2), 1: FlexColumnWidth(1)},
            children: [
              for (final r in m.rows)
                TableRow(
                  children: [
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: 2),
                      child: Text(r.label, style: Theme.of(context).textTheme.bodySmall),
                    ),
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: 2),
                      child: Text('${r.score}', style: Theme.of(context).textTheme.bodySmall?.copyWith(fontWeight: FontWeight.w600)),
                    ),
                  ],
                ),
              TableRow(
                children: [
                  Padding(
                    padding: const EdgeInsets.only(top: 6),
                    child: Text('총점', style: Theme.of(context).textTheme.titleSmall),
                  ),
                  Padding(
                    padding: const EdgeInsets.only(top: 6),
                    child: Text('${m.totalScore}', style: Theme.of(context).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.bold)),
                  ),
                ],
              ),
            ],
          ),
        ],
      ),
    );
  }
}
