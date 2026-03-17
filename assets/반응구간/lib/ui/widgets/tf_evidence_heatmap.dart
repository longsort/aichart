import 'package:flutter/material.dart';

class TfEvidenceHeatmap extends StatelessWidget {
  /// matrix[TF][Evidence] = 0~100
  final Map<String, Map<String, int>> matrix;

  const TfEvidenceHeatmap({
    super.key,
    required this.matrix,
  });

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final muted = cs.onSurface.withOpacity(0.65);

    final tfs = matrix.keys.toList();
    final evidences = <String>{
      for (final tf in tfs) ...matrix[tf]!.keys,
    }.toList();

    int getVal(String tf, String ev) => (matrix[tf]?[ev] ?? 0).clamp(0, 100);

    Color cellColor(int v) {
      // 색 고정 안 하려고 opacity로만 강도 표현
      return cs.primary.withOpacity(0.10 + (v / 100.0) * 0.55);
    }

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: cs.surface.withOpacity(0.92),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: cs.outline.withOpacity(0.45)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'TF × Evidence Heatmap',
            style: TextStyle(color: cs.onSurface, fontSize: 14, fontWeight: FontWeight.w900),
          ),
          const SizedBox(height: 10),
          Text(
            '진할수록 근거가 강함(0~100)',
            style: TextStyle(color: muted, fontSize: 12, fontWeight: FontWeight.w800),
          ),
          const SizedBox(height: 10),

          // 헤더(증거명)
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Column(
              children: [
                Row(
                  children: [
                    _headerCell(context, 'TF'),
                    for (final ev in evidences) _headerCell(context, ev, w: 92),
                  ],
                ),
                const SizedBox(height: 6),
                for (final tf in tfs)
                  Row(
                    children: [
                      _tfCell(context, tf),
                      for (final ev in evidences)
                        _heatCell(context, getVal(tf, ev), w: 92, bg: cellColor(getVal(tf, ev))),
                    ],
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _headerCell(BuildContext context, String text, {double w = 58}) {
    final cs = Theme.of(context).colorScheme;
    return Container(
      width: w,
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
      margin: const EdgeInsets.only(right: 6),
      decoration: BoxDecoration(
        color: Colors.black.withOpacity(0.12),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: cs.outline.withOpacity(0.35)),
      ),
      child: Text(
        text,
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: TextStyle(color: cs.onSurface.withOpacity(0.75), fontSize: 11, fontWeight: FontWeight.w900),
      ),
    );
  }

  Widget _tfCell(BuildContext context, String tf) => _headerCell(context, tf, w: 58);

  Widget _heatCell(BuildContext context, int v, {required double w, required Color bg}) {
    final cs = Theme.of(context).colorScheme;
    final muted = cs.onSurface.withOpacity(0.65);
    return Container(
      width: w,
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
      margin: const EdgeInsets.only(right: 6, bottom: 6),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: cs.outline.withOpacity(0.30)),
      ),
      child: Text(
        '$v',
        style: TextStyle(color: muted, fontSize: 11, fontWeight: FontWeight.w900),
      ),
    );
  }
}