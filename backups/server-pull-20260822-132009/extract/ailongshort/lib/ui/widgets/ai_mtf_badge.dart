import 'package:flutter/material.dart';

class AiMtfBadge extends StatelessWidget {
  final String label;
  final int percent;

  const AiMtfBadge({super.key, required this.label, required this.percent});

  Color _c() {
    if (label.contains('?ÅÎ∞©')) return const Color(0xFF1EEA6A);
    if (label.contains('?òÎ∞©')) return const Color(0xFFEA2A2A);
    return const Color(0xFF4DA3FF);
  }

  @override
  Widget build(BuildContext context) {
    final c = _c();
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(999),
        color: c.withOpacity(0.15),
        border: Border.all(color: c.withOpacity(0.4)),
      ),
      child: Text('$label $percent%',
          style: TextStyle(fontSize: 11, fontWeight: FontWeight.w900, color: c)),
    );
  }
}
