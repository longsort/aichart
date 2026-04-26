
import 'package:flutter/material.dart';
import '../../core/models/fu_state.dart';
import '../../core/utils/candle_close_util.dart';
import 'neon_theme.dart';

class TFStripV2 extends StatelessWidget {
  final List<String> items;
  final String selected;
  final Map<String, FuTfPulse> pulse;
  final ValueChanged<String> onSelect;

  const TFStripV2({
    super.key,
    required this.items,
    required this.selected,
    required this.pulse,
    required this.onSelect,
  });

  String _badgeFor(FuTfPulse p){
    final d = p.dir.toUpperCase();
    if (d == 'LONG') return 'B';
    if (d == 'SHORT') return 'S';
    return 'W';
  }

  @override
  Widget build(BuildContext context) {
    final t = NeonTheme.of(context);
    return Padding(
      padding: const EdgeInsets.only(bottom: 2),
      child: Wrap(
        spacing: 8,
        runSpacing: 8,
        children: items.map((e) {
          final sel = e == selected;
          final p = pulse[e] ?? FuTfPulse.empty();
          final badge = _badgeFor(p);

          final next = CandleCloseUtil.nextCloseFor(e);
          final remain = next.difference(DateTime.now());
          final closingSoon = remain.inMinutes >= 0 && remain.inMinutes <= 5;

          Color badgeColor = t.muted;
          if (badge == 'B') badgeColor = t.good;
          if (badge == 'S') badgeColor = t.bad;

          return InkWell(
            onTap: () => onSelect(e),
            borderRadius: BorderRadius.circular(999),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
              decoration: BoxDecoration(
                color: sel ? t.card : t.bg,
                borderRadius: BorderRadius.circular(999),
                border: Border.all(color: sel ? t.good : t.border),
              ),
              child: Row(mainAxisSize: MainAxisSize.min, children: [
                Text(
                  e,
                  style: TextStyle(
                    color: sel ? t.good : t.fg,
                    fontWeight: FontWeight.w900,
                    fontSize: 12,
                    height: 1.0,
                  ),
                ),
                const SizedBox(width: 6),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                  decoration: BoxDecoration(
                    color: badgeColor.withOpacity(closingSoon ? 0.25 : 0.14),
                    borderRadius: BorderRadius.circular(999),
                    border: Border.all(color: badgeColor.withOpacity(closingSoon ? 0.85 : 0.45)),
                  ),
                  child: Text(
                    badge,
                    style: TextStyle(
                      color: badgeColor,
                      fontWeight: FontWeight.w900,
                      fontSize: 11,
                      height: 1.0,
                    ),
                  ),
                ),
              ]),
            ),
          );
        }).toList(),
      ),
    );
  }
}
