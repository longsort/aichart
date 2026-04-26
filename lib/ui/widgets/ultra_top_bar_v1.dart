import 'dart:ui';
import 'package:flutter/material.dart';

import 'neon_theme.dart';

class UltraTopBarV1 extends StatelessWidget implements PreferredSizeWidget {
  final String title;
  final String symbol;
  final String tf;
  final ValueChanged<String>? onChangeSymbol;
  final VoidCallback? onOpenSettings;
  final VoidCallback? onOpenPattern;
  final VoidCallback? onOpenSignals;
  final VoidCallback? onOpenTradeChart;
  final VoidCallback? onOpenGlossary;

  const UltraTopBarV1({
    super.key,
    required this.title,
    required this.symbol,
    required this.tf,
    this.onChangeSymbol,
    this.onOpenSettings,
    this.onOpenPattern,
    this.onOpenSignals,
    this.onOpenTradeChart,
    this.onOpenGlossary,
  });

  @override
  Size get preferredSize => const Size.fromHeight(64);

  @override
  Widget build(BuildContext context) {
    final t = NeonTheme.of(context);
    return SafeArea(
      bottom: false,
      child: ClipRRect(
        child: BackdropFilter(
          filter: ImageFilter.blur(sigmaX: 14, sigmaY: 14),
          child: Container(
        padding: const EdgeInsets.fromLTRB(16, 10, 16, 10),
        decoration: BoxDecoration(
          color: t.bg.withOpacity(0.55),
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [
              t.bg.withOpacity(0.65),
              t.card.withOpacity(0.35),
            ],
          ),
          border: Border(
            bottom: BorderSide(color: t.border.withOpacity(0.35), width: 1),
          ),
        ),
        child: Row(
          children: [
            Text(
              title,
              style: TextStyle(
                color: t.fg,
                fontSize: 22,
                fontWeight: FontWeight.w800,
              ),
            ),
            const Spacer(),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              decoration: BoxDecoration(
                color: t.card,
                borderRadius: BorderRadius.circular(999),
                border: Border.all(color: t.border.withOpacity(0.5)),
              ),
              child: Row(
                children: [
                  Text(symbol, style: TextStyle(color: t.fg, fontWeight: FontWeight.w700)),
                  const SizedBox(width: 10),
                  Text(tf, style: TextStyle(color: t.muted, fontWeight: FontWeight.w700)),
                ],
              ),
            ),
            const SizedBox(width: 10),
            IconButton(
              tooltip: '?®ÌÑ¥',
              onPressed: onOpenPattern,
              icon: Icon(Icons.auto_graph, color: t.muted),
            ),
            const SizedBox(width: 2),
            IconButton(
              tooltip: '?†Ìò∏',
              onPressed: onOpenSignals,
              icon: Icon(Icons.traffic, color: t.muted),
            ),
            const SizedBox(width: 2),
            IconButton(
              tooltip: 'ÏßÄ?úÏÇ¨??,
              onPressed: onOpenGlossary,
              icon: Icon(Icons.help_outline_rounded, color: t.muted),
            ),
            const SizedBox(width: 2),
            // ?ÑÏ≤¥?îÎ©¥(Ï∞®Ìä∏ ?¨Í≤å) Î≤ÑÌäº?Ä ?ïÎ?/Ï∂ïÏÜå ??Ï∫îÎì§ Ïß§Î¶º/?úÍ≥° ?¥ÏäàÍ∞Ä ?àÏñ¥
            // Î©îÏù∏ Ï∞®Ìä∏ ?àÏ†ï???ÑÍπåÏßÄ UI?êÏÑú ?úÍ±∞?úÎã§.
            // (?ºÏö∞??ÏΩúÎ∞±?Ä ?®Í≤®?êÎêò Î≤ÑÌäºÎß??®Í?)
            IconButton(
              tooltip: '?§Ï†ï',
              onPressed: onOpenSettings,
              icon: Icon(Icons.settings, color: t.muted),
            ),
            if (onChangeSymbol != null) ...[
              const SizedBox(width: 10),
              IconButton(
                tooltip: 'ÏΩîÏù∏ Î≥ÄÍ≤?,
                onPressed: () async {
                  final v = await showDialog<String>(
                    context: context,
                    builder: (ctx) {
                      final c = TextEditingController(text: symbol);
                      return AlertDialog(
                        backgroundColor: t.card,
                        title: Text('ÏΩîÏù∏', style: TextStyle(color: t.fg)),
                        content: TextField(
                          controller: c,
                          style: TextStyle(color: t.fg),
                          decoration: const InputDecoration(hintText: 'BTCUSDT'),
                        ),
                        actions: [
                          TextButton(
                            onPressed: () => Navigator.pop(ctx),
                            child: const Text('Ï∑®ÏÜå'),
                          ),
                          TextButton(
                            onPressed: () => Navigator.pop(ctx, c.text.trim()),
                            child: const Text('?ïÏù∏'),
                          ),
                        ],
                      );
                    },
                  );
                  if (v != null && v.trim().isNotEmpty) onChangeSymbol!(v.trim());
                },
                icon: Icon(Icons.tune, color: t.muted),
              ),
            ],
          ],
        ),
      ),
    ),
  ),
);
  }
}
