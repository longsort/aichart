import 'package:flutter/material.dart';
import 'neon_theme.dart';

class TFStripV1 extends StatelessWidget {
  final List<String> items;
  final String selected;
  final ValueChanged<String> onSelect;
  const TFStripV1({super.key, required this.items, required this.selected, required this.onSelect});

  @override
  Widget build(BuildContext context) {
    final t = NeonTheme.of(context);
    // No-scroll, overflow-safe strip: wraps into multiple lines when needed.
    return Padding(
      padding: const EdgeInsets.only(bottom: 2),
      child: Wrap(
        spacing: 8,
        runSpacing: 8,
        children: items.map((e) {
          final sel = e == selected;
          return InkWell(
            onTap: () => onSelect(e),
            borderRadius: BorderRadius.circular(999),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              decoration: BoxDecoration(
                color: sel ? t.card : t.bg,
                borderRadius: BorderRadius.circular(999),
                border: Border.all(color: sel ? t.good : t.border),
              ),
              child: Text(
                e,
                style: TextStyle(
                  color: sel ? t.good : t.fg,
                  fontWeight: FontWeight.w900,
                  fontSize: 12,
                  height: 1.0,
                ),
              ),
            ),
          );
        }).toList(),
      ),
    );
  }
}
