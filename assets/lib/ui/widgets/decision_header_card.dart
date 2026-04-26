
import 'package:flutter/material.dart';
import '../../../engine/models/briefing_output.dart';

class DecisionHeaderCard extends StatelessWidget {
  final BriefingOutput? briefing;
  const DecisionHeaderCard({super.key, required this.briefing});

  Color _statusColor(BuildContext context, String s) {
    final cs = Theme.of(context).colorScheme;
    switch (s.toLowerCase()) {
      case 'confirm':
      case 'trade':
        return cs.primary;
      case 'caution':
        return cs.tertiary;
      case 'watch':
      default:
        return cs.outlineVariant;
    }
  }

  String _statusLabel(String s) {
    switch (s.toLowerCase()) {
      case 'confirm':
      case 'trade':
        return 'TRADE';
      case 'caution':
        return 'CAUTION';
      case 'watch':
      default:
        return 'WATCH';
    }
  }

  @override
  Widget build(BuildContext context) {
    final b = briefing;
    if (b == null) {
      return _skeleton(context, '동기화 후 분석 표시');
    }
    final status = _statusLabel(b.status);
    final color = _statusColor(context, b.status);
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: color.withOpacity(0.8)),
        color: Colors.black.withOpacity(0.15),
      ),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(999),
              border: Border.all(color: color),
            ),
            child: Text(status, style: TextStyle(color: color, fontWeight: FontWeight.w700)),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              '${b.symbol} · ${b.tf} · ${b.lastPrice.toStringAsFixed(2)}',
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontWeight: FontWeight.w700),
            ),
          ),
          const SizedBox(width: 10),
          Text('CONF ${b.confidence}%', style: TextStyle(color: color, fontWeight: FontWeight.w700)),
        ],
      ),
    );
  }

  Widget _skeleton(BuildContext context, String text) {
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: Colors.grey.shade800),
        color: Colors.black.withOpacity(0.12),
      ),
      child: Text(text, style: TextStyle(color: Colors.grey.shade400)),
    );
  }
}
