
import 'package:flutter/material.dart';
import 'neon_theme.dart';

class HelpSheetV1 extends StatelessWidget {
  final String symbol;
  final String tf;
  final bool safeMode;
  final String? lastError;

  const HelpSheetV1({
    super.key,
    required this.symbol,
    required this.tf,
    required this.safeMode,
    required this.lastError,
  });

  @override
  Widget build(BuildContext context) {
    final theme = NeonTheme.of(context);

    Widget line(String txt) => Padding(
          padding: const EdgeInsets.only(bottom: 10),
          child: Text(txt, style: TextStyle(color: theme.fg, fontSize: 13, height: 1.25)),
        );

    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(12, 12, 12, 16),
        child: Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: theme.card,
            borderRadius: BorderRadius.circular(18),
            border: Border.all(color: theme.border),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('ì´ˆë³´ ?„ì?ë§?, style: TextStyle(color: theme.fg, fontWeight: FontWeight.w900, fontSize: 16)),
              const SizedBox(height: 10),
              line('?„ì¬: $symbol / $tf'),
              line('???œì ??? ë¢°/?„í—˜?ì? ì°¸ê³ ?©ì…?ˆë‹¤. 100%???†ìŠµ?ˆë‹¤.'),
              line('??ì´ˆë³´ ê¸°ì?: (1) ê·¼ê±° 5ê°?ì¤?ìµœì†Œ 3ê°?(2) SL ë¨¼ì? (3) RR??:2 (4) ê³„ì¢Œ 5% ë¦¬ìŠ¤??),
              line('??ê±°ë˜ê¸ˆì?(NO-TRADE)ë©??¬ì„¸?? ?´ê²Œ ì´ˆë³´ê°€ ??ì§€?¤ëŠ” ë°©ë²•?…ë‹ˆ??'),
              if (lastError != null) ...[
                const SizedBox(height: 6),
                Text('ë§ˆì?ë§??ëŸ¬', style: TextStyle(color: theme.warn, fontWeight: FontWeight.w800)),
                const SizedBox(height: 6),
                SelectableText(lastError!, style: TextStyle(color: theme.warn)),
              ],
              const SizedBox(height: 10),
              Text('SAFE ëª¨ë“œ: ${safeMode ? 'ì¼œì§' : 'êº¼ì§'}', style: TextStyle(color: theme.muted)),
            ],
          ),
        ),
      ),
    );
  }
}
