import 'package:flutter/material.dart';
import '../../engine/models/briefing_output.dart';
import '../../engine/export/report_exporter.dart';

/// PHASE E + S-05 + S-12 ??BriefingOutput ?úÏãú, ?êÏÇ∞ ?ÖÎ†•, ?Ä??TXT/PDF)
class BriefingPanel extends StatelessWidget {
  final BriefingOutput? briefingOutput;
  final double equity;
  final ValueChanged<double>? onEquityChanged;

  const BriefingPanel({super.key, this.briefingOutput, this.equity = 10000, this.onEquityChanged});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      margin: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.grey.shade900,
        borderRadius: BorderRadius.circular(8),
      ),
      child: briefingOutput == null
          ? const Text('Î∏åÎ¶¨???ÅÏó≠')
          : Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text('${briefingOutput!.lastPrice.toStringAsFixed(2)} / ${briefingOutput!.status} / ?†Î¢∞??${briefingOutput!.confidence}%',
                          style: Theme.of(context).textTheme.titleSmall),
                    ),
                    if (onEquityChanged != null)
                      SizedBox(
                        width: 100,
                        child: TextField(
                          key: ValueKey(equity),
                          keyboardType: TextInputType.number,
                          decoration: InputDecoration(
                            labelText: '?êÏÇ∞',
                            hintText: equity.toStringAsFixed(0),
                            isDense: true,
                          ),
                          onSubmitted: (s) {
                            final v = double.tryParse(s);
                            if (v != null && v > 0) onEquityChanged!(v);
                          },
                        ),
                      ),
                  ],
                ),
                if (briefingOutput!.lockReason != null)
                  Padding(
                    padding: const EdgeInsets.only(top: 4),
                    child: Text('Îß§Îß§ Í∏àÏ?: ${briefingOutput!.lockReason}', style: TextStyle(color: Theme.of(context).colorScheme.error, fontWeight: FontWeight.w600)),
                  ),
                const SizedBox(height: 8),
                Text(briefingOutput!.summaryLine, style: Theme.of(context).textTheme.bodyMedium),
                if (briefingOutput!.evidenceBullets.isNotEmpty) ...[
                  const SizedBox(height: 8),
                  ...briefingOutput!.evidenceBullets.take(5).map((b) => Padding(
                        padding: const EdgeInsets.only(bottom: 2),
                        child: Text('??$b', style: Theme.of(context).textTheme.bodySmall),
                      )),
                ],
                if (briefingOutput!.scenarios.isNotEmpty) ...[
                  const SizedBox(height: 8),
                  ...briefingOutput!.scenarios.map((s) => Padding(
                        padding: const EdgeInsets.only(bottom: 4),
                        child: Text(
                          '${s.name}: ${s.condition} (?ïÎ•† ${s.prob}%) ÏßÑÏûÖ ${s.entry?.toStringAsFixed(0)} ?êÏ†à ${s.sl?.toStringAsFixed(0)} Î™©Ìëú ${s.tp?.toStringAsFixed(0)} RR ${s.rr}${s.positionSize != null ? ' ?òÎüâ ${s.positionSize!.toStringAsFixed(4)}' : ''}',
                          style: Theme.of(context).textTheme.bodySmall,
                        ),
                      )),
                ],
                const SizedBox(height: 8),
                Text(briefingOutput!.managerComment, style: Theme.of(context).textTheme.bodySmall?.copyWith(color: Colors.orange.shade700)),
                if (briefingOutput != null) ...[
                  const SizedBox(height: 8),
                  Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      TextButton.icon(
                        icon: const Icon(Icons.save, size: 18),
                        label: const Text('TXT ?Ä??),
                        onPressed: () => _saveTxt(context, briefingOutput!),
                      ),
                      TextButton.icon(
                        icon: const Icon(Icons.picture_as_pdf, size: 18),
                        label: const Text('PDF ?Ä??),
                        onPressed: () => _savePdf(context, briefingOutput!),
                      ),
                    ],
                  ),
                ],
              ],
            ),
    );
  }

  static Future<void> _saveTxt(BuildContext context, BriefingOutput b) async {
    try {
      final path = await ReportExporter.exportTxt(b);
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('?Ä?•Îê®: $path')));
      }
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('?Ä???§Ìå®: $e')));
      }
    }
  }

  static Future<void> _savePdf(BuildContext context, BriefingOutput b) async {
    try {
      final path = await ReportExporter.exportPdf(b);
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('?Ä?•Îê®: $path')));
      }
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('?Ä???§Ìå®: $e')));
      }
    }
  }
}
