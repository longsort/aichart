
import 'package:flutter/material.dart';
import 'neon_theme.dart';

class SRLineV1 extends StatelessWidget {
  final double s1, r1, vwap;
  final int riskPct;
  final String note;
  const SRLineV1({
    super.key,
    required this.s1,
    required this.r1,
    required this.vwap,
    required this.riskPct,
    required this.note,
  });

  @override
  Widget build(BuildContext context) {
    final theme = NeonTheme.of(context);

    String riskText() {
      if (riskPct >= 75) return '?’ìŒ';
      if (riskPct >= 50) return 'ë³´í†µ';
      return '??Œ';
    }

    Widget chip(String k, String v) {
      return Expanded(
        child: Container(
          padding: const EdgeInsets.all(10),
          decoration: BoxDecoration(
            color: theme.card,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: theme.border),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(k, style: TextStyle(color: theme.muted, fontSize: 11, fontWeight: FontWeight.w900)),
              const SizedBox(height: 6),
              Text(v, style: TextStyle(color: theme.fg, fontWeight: FontWeight.w900)),
            ],
          ),
        ),
      );
    }

    return Row(
      children: [
        chip('ì§€ì§€(?„ëž˜)', s1.toStringAsFixed(0)),
        const SizedBox(width: 8),
        chip('?‰ê· ??VWAP)', vwap.toStringAsFixed(0)),
        const SizedBox(width: 8),
        chip('?€????', r1.toStringAsFixed(0)),
        const SizedBox(width: 8),
    // NOTE: riskText is a Function -> must be invoked via interpolation
    chip('?„í—˜', '$riskPct% (${riskText()})'),
        const SizedBox(width: 8),
        Expanded(
          child: Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: theme.card,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: theme.border),
            ),
            child: Align(
              alignment: Alignment.centerRight,
              child: Text(note, style: TextStyle(color: theme.fg, fontWeight: FontWeight.w900)),
            ),
          ),
        ),
      ],
    );
  }
}
