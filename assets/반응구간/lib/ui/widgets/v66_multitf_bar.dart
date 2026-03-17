import 'package:flutter/material.dart';

class V66MultiTfBar extends StatefulWidget {
  final String tf;
  final double pUp1;
  final double pUp3;
  final double pUp5;
  final int evidenceHit;
  final int evidenceTotal;

  const V66MultiTfBar({
    super.key,
    required this.tf,
    required this.pUp1,
    required this.pUp3,
    required this.pUp5,
    required this.evidenceHit,
    required this.evidenceTotal,
  });

  @override
  State<V66MultiTfBar> createState() => _V66MultiTfBarState();
}

class _V66MultiTfBarState extends State<V66MultiTfBar> {
  bool open = false;

  @override
  Widget build(BuildContext context) {
    final hit = widget.evidenceHit;
    final tot = widget.evidenceTotal == 0 ? 1 : widget.evidenceTotal;
    final hitPct = (hit / tot * 100).clamp(0, 100).toStringAsFixed(0);

    Widget chip(String t) => Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
          decoration: BoxDecoration(
            color: Colors.white.withOpacity(0.06),
            borderRadius: BorderRadius.circular(999),
            border: Border.all(color: Colors.white.withOpacity(0.12)),
          ),
          child: Text(t, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700)),
        );

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.05),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: Colors.white.withOpacity(0.10)),
      ),
      child: Column(
        children: [
          Row(
            children: [
              chip('TF ${widget.tf.toUpperCase()}'),
              const SizedBox(width: 8),
              chip('근거 $hit/$tot ($hitPct%)'),
              const Spacer(),
              IconButton(
                onPressed: () => setState(() => open = !open),
                icon: Icon(open ? Icons.expand_less : Icons.expand_more, color: Colors.white),
                tooltip: 'Details',
              ),
            ],
          ),
          if (open) ...[
            const SizedBox(height: 10),
            _bar('↑1', widget.pUp1),
            const SizedBox(height: 6),
            _bar('↑3', widget.pUp3),
            const SizedBox(height: 6),
            _bar('↑5', widget.pUp5),
            const SizedBox(height: 8),
            const Text(
              '멀티TF/히트맵/큰손 streak는 다음 패치에서 이 바 아래로 붙임',
              style: TextStyle(fontSize: 12, color: Colors.white70),
            ),
          ],
        ],
      ),
    );
  }

  Widget _bar(String label, double v) {
    final pct = (v * 100).clamp(0, 100);
    return Row(
      children: [
        SizedBox(width: 36, child: Text(label, style: const TextStyle(fontSize: 12, color: Colors.white70))),
        Expanded(
          child: ClipRRect(
            borderRadius: BorderRadius.circular(999),
            child: LinearProgressIndicator(
              value: pct / 100.0,
              minHeight: 10,
              backgroundColor: Colors.white.withOpacity(0.08),
              valueColor: AlwaysStoppedAnimation<Color>(Colors.cyanAccent.withOpacity(0.9)),
            ),
          ),
        ),
        const SizedBox(width: 8),
        SizedBox(width: 44, child: Text('${pct.toStringAsFixed(0)}%', style: const TextStyle(fontSize: 12))),
      ],
    );
  }
}